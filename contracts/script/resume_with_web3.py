#!/usr/bin/env python3
"""
Resume Fanovo deployment using web3.py
Reads transaction data from Foundry broadcast file and sends via Python.
This bypasses Foundry/Alloy receipt parsing issues with X Layer.
"""

import json
import time
import os
from web3 import Web3
from eth_account import Account
from eth_utils import to_checksum_address

# ─── Config ──────────────────────────────────────────────────────────────────
RPC_URL = "https://xlayer-mainnet.g.alchemy.com/v2/REDACTED_ALCHEMY_KEY"
PRIVATE_KEY = os.getenv("PRIVATE_KEY", "")
CHAIN_ID = 196

# Starting nonce (check with: cast nonce <addr> --rpc-url ...)
START_NONCE = 417

# Broadcast file from last failed run
BROADCAST_FILE = "broadcast/DeployAll_Phase2.s.sol/196/run-latest.json"

# ─── Setup ───────────────────────────────────────────────────────────────────
if not PRIVATE_KEY:
    print("ERROR: Set PRIVATE_KEY env var")
    exit(1)

w3 = Web3(Web3.HTTPProvider(RPC_URL, request_kwargs={'timeout': 60}))
account = Account.from_key(PRIVATE_KEY)

current_nonce = w3.eth.get_transaction_count(account.address)
print(f"Deployer: {account.address}")
print(f"Current nonce on chain: {current_nonce}")
print(f"Expected start nonce: {START_NONCE}")

if current_nonce != START_NONCE:
    print(f"WARNING: Nonce mismatch! Chain={current_nonce}, expected={START_NONCE}")
    print("Adjusting START_NONCE to chain nonce...")
    START_NONCE = current_nonce

# ─── Load transactions ───────────────────────────────────────────────────────
with open(BROADCAST_FILE, 'r') as f:
    broadcast = json.load(f)

transactions = broadcast.get("transactions", [])
print(f"Total transactions in broadcast: {len(transactions)}")

# Filter out already-sent transactions (those with hash != None)
remaining = [tx for tx in transactions if tx.get("hash") is None]
print(f"Remaining to send: {len(remaining)}")

if not remaining:
    print("All transactions already sent!")
    exit(0)

# ─── Send transactions ───────────────────────────────────────────────────────
print(f"\nSending {len(remaining)} transactions...")
print("=" * 60)

tx_hashes = []

for i, tx_data in enumerate(remaining):
    tx_info = tx_data["transaction"]
    
    # Build EIP-1559 transaction (X Layer requires this)
    gas_limit = int(tx_info.get("gas", "0x0"), 16)
    legacy_gas_price = int(tx_info.get("gasPrice", "0x1312d01"), 16)
    
    tx = {
        'nonce': START_NONCE + i,
        'gas': gas_limit,
        'maxFeePerGas': legacy_gas_price,
        'maxPriorityFeePerGas': 1,  # X Layer minimum
        'to': to_checksum_address(tx_info["to"]) if tx_info.get("to") else None,
        'value': int(tx_info.get("value", "0x0"), 16),
        'data': tx_info.get("data", "0x"),
        'chainId': CHAIN_ID,
        'type': 2,  # EIP-1559
    }
    
    # For CREATE transactions, 'to' should be None (contract deployment)
    if tx_data.get("transactionType") == "CREATE":
        tx['to'] = None
    
    signed = account.sign_transaction(tx)
    tx_hash = w3.eth.send_raw_transaction(signed.rawTransaction)
    tx_hashes.append(tx_hash.hex())
    
    print(f"[{i+1}/{len(remaining)}] Sent: {tx_hash.hex()}")
    
    # Brief pause to avoid rate limiting
    if (i + 1) % 50 == 0:
        print(f"  Pausing after {i+1} txs...")
        time.sleep(5)

print("\n" + "=" * 60)
print(f"Sent {len(tx_hashes)} transactions")
print("\nWaiting for confirmations...")

# ─── Check receipts ──────────────────────────────────────────────────────────
confirmed = 0
failed = 0
pending = len(tx_hashes)

for _ in range(30):  # Check for 5 minutes max
    for tx_hash in tx_hashes[:]:
        try:
            receipt = w3.eth.get_transaction_receipt(tx_hash)
            if receipt:
                tx_hashes.remove(tx_hash)
                if receipt['status'] == 1:
                    confirmed += 1
                else:
                    failed += 1
                    print(f"  FAILED: {tx_hash}")
        except:
            pass
    
    if not tx_hashes:
        break
    
    print(f"  Pending: {len(tx_hashes)} | Confirmed: {confirmed} | Failed: {failed}")
    time.sleep(10)

print(f"\n=== RESULTS ===")
print(f"Confirmed: {confirmed}")
print(f"Failed: {failed}")
print(f"Still pending: {len(tx_hashes)}")

if tx_hashes:
    print("\nPending transactions:")
    for h in tx_hashes:
        print(f"  {h}")
