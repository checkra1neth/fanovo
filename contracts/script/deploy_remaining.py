#!/usr/bin/env python3
"""
Python deployment script to complete Fanovo protocol deployment on X Layer.
Uses web3.py to bypass Foundry/Alloy receipt parsing issues.
"""

import os
import sys
import json
import time
from decimal import Decimal
from dotenv import load_dotenv
from web3 import Web3
from eth_account import Account
from eth_abi import encode

# Load env
load_dotenv()

# ─── Configuration ───────────────────────────────────────────────────────────
RPC_URL = "https://xlayer-mainnet.g.alchemy.com/v2/REDACTED_ALCHEMY_KEY"
PRIVATE_KEY = os.getenv("PRIVATE_KEY", "")

# Already deployed
FANOVO_TOKEN = "0xe81de3d4db134d2E722Bc4A2E4f07e4A4231b131"
HOOK_DEPLOYER = "0xD65D0F83EB6A6ED26b57E9d628F70a1e00b6997E"
WORLD_CUP_HOOK = "0x39ECCF85f3F97D2020f5A7b3eeED5695EC636aA8"
PLAYER_HOOK = "0x3Ad1ECB123443CbC308058B03E130045bc9E6AA8"

# Constants
POOL_MANAGER = "0x360E68faCcca8cA495c1B759Fd9EEe466db9FB32"
USDT = "0x779Ded0c9e1022225f8E0630b35a9b54bE713736"

# ─── ABIs (minimal) ──────────────────────────────────────────────────────────

HOOK_DEPLOYER_ABI = [
    {"inputs":[],"name":"deployPlayer","outputs":[{"internalType":"contract PlayerHook","name":"hook","type":"address"}],"stateMutability":"nonpayable","type":"function"}
]

FACTORY_ABI = [
    {"inputs":[{"internalType":"string","name":"name_","type":"string"},{"internalType":"string","name":"symbol_","type":"string"},{"internalType":"string","name":"code_","type":"string"}],"name":"createCountry","outputs":[{"internalType":"contract CountryToken","name":"","type":"address"}],"stateMutability":"nonpayable","type":"function"},
    {"inputs":[],"name":"completeSetup","outputs":[],"stateMutability":"nonpayable","type":"function"},
    {"inputs":[{"internalType":"uint256","name":"","type":"uint256"}],"name":"countries","outputs":[{"internalType":"contract CountryToken","name":"","type":"address"}],"stateMutability":"view","type":"function"},
    {"inputs":[{"internalType":"uint8","name":"countryIndex","type":"uint8"},{"internalType":"uint8","name":"role","type":"uint8"},{"internalType":"address","name":"country","type":"address"},{"internalType":"string","name":"name_","type":"string"},{"internalType":"string","name":"symbol_","type":"string"}],"name":"createPlayer","outputs":[{"internalType":"contract PlayerToken","name":"","type":"address"}],"stateMutability":"nonpayable","type":"function"},
    {"inputs":[],"name":"completeSetup","outputs":[],"stateMutability":"nonpayable","type":"function"},
    {"inputs":[{"internalType":"uint256","name":"","type":"uint256"}],"name":"players","outputs":[{"internalType":"contract PlayerToken","name":"","type":"address"}],"stateMutability":"view","type":"function"}
]

HOOK_ABI = [
    {"inputs":[{"internalType":"address","name":"country","type":"address"}],"name":"registerCountry","outputs":[],"stateMutability":"nonpayable","type":"function"},
    {"inputs":[{"internalType":"address","name":"player","type":"address"}],"name":"registerPlayer","outputs":[],"stateMutability":"nonpayable","type":"function"},
    {"inputs":[{"internalType":"address","name":"packOpener_","type":"address"}],"name":"setPackOpener","outputs":[],"stateMutability":"nonpayable","type":"function"},
    {"inputs":[],"name":"finalize","outputs":[],"stateMutability":"nonpayable","type":"function"},
    {"inputs":[{"internalType":"address","name":"user","type":"address"},{"internalType":"address","name":"country","type":"address"}],"name":"packMint","outputs":[],"stateMutability":"nonpayable","type":"function"}
]

POOL_MANAGER_ABI = [
    {"inputs":[{"components":[{"internalType":"Currency","name":"currency0","type":"address"},{"internalType":"Currency","name":"currency1","type":"address"},{"internalType":"uint24","name":"fee","type":"uint24"},{"internalType":"int24","name":"tickSpacing","type":"int24"},{"internalType":"contract IHooks","name":"hooks","type":"address"}],"internalType":"struct PoolKey","name":"key","type":"tuple"},{"internalType":"uint160","name":"sqrtPriceX96","type":"uint160"}],"name":"initialize","outputs":[{"internalType":"int24","name":"tick","type":"int24"}],"stateMutability":"nonpayable","type":"function"}
]

TOKEN_ABI = [
    {"inputs":[{"internalType":"address","name":"to","type":"address"},{"internalType":"uint256","name":"amount","type":"uint256"}],"name":"transfer","outputs":[{"internalType":"bool","name":"","type":"bool"}],"stateMutability":"nonpayable","type":"function"},
    {"inputs":[{"internalType":"address","name":"spender","type":"address"},{"internalType":"uint256","name":"amount","type":"uint256"}],"name":"approve","outputs":[{"internalType":"bool","name":"","type":"bool"}],"stateMutability":"nonpayable","type":"function"}
]

def send_tx(w3, account, contract, function_name, args, value=0, gas_limit=None):
    """Send a transaction and wait for receipt."""
    func = contract.get_function_by_name(function_name)(*args)
    tx = func.build_transaction({
        'from': account.address,
        'nonce': w3.eth.get_transaction_count(account.address),
        'gas': gas_limit or 5000000,
        'gasPrice': w3.eth.gas_price,
        'value': value,
        'chainId': 196
    })
    signed = account.sign_transaction(tx)
    tx_hash = w3.eth.send_raw_transaction(signed.rawTransaction)
    print(f"  Sent {function_name} -> {tx_hash.hex()}")
    
    # Wait for receipt with custom retry
    for _ in range(60):
        try:
            receipt = w3.eth.get_transaction_receipt(tx_hash)
            if receipt:
                if receipt['status'] == 1:
                    print(f"  ✓ Confirmed in block {receipt['blockNumber']}")
                    return receipt
                else:
                    print(f"  ✗ FAILED in block {receipt['blockNumber']}")
                    return None
        except Exception as e:
            pass
        time.sleep(2)
    
    print(f"  ? Timeout waiting for receipt")
    return None

def deploy_contract(w3, account, bytecode, abi, constructor_args, gas_limit=None):
    """Deploy a contract."""
    Contract = w3.eth.contract(abi=abi, bytecode=bytecode)
    tx = Contract.constructor(*constructor_args).build_transaction({
        'from': account.address,
        'nonce': w3.eth.get_transaction_count(account.address),
        'gas': gas_limit or 8000000,
        'gasPrice': w3.eth.gas_price,
        'chainId': 196
    })
    signed = account.sign_transaction(tx)
    tx_hash = w3.eth.send_raw_transaction(signed.rawTransaction)
    print(f"  Deploy tx: {tx_hash.hex()}")
    
    for _ in range(60):
        try:
            receipt = w3.eth.get_transaction_receipt(tx_hash)
            if receipt:
                addr = receipt['contractAddress']
                if receipt['status'] == 1:
                    print(f"  ✓ Deployed at {addr}")
                    return addr
                else:
                    print(f"  ✗ Deploy FAILED")
                    return None
        except:
            pass
        time.sleep(2)
    return None

def main():
    if not PRIVATE_KEY:
        print("ERROR: PRIVATE_KEY not set in .env")
        sys.exit(1)
    
    w3 = Web3(Web3.HTTPProvider(RPC_URL))
    account = Account.from_key(PRIVATE_KEY)
    
    print(f"Deployer: {account.address}")
    print(f"Nonce: {w3.eth.get_transaction_count(account.address)}")
    print(f"Balance: {w3.from_wei(w3.eth.get_balance(account.address), 'ether')} XLR")
    print()
    
    # Check what's already deployed
    print("=== Checking already deployed contracts ===")
    fanovo = w3.eth.contract(address=FANOVO_TOKEN, abi=TOKEN_ABI)
    wc_hook = w3.eth.contract(address=WORLD_CUP_HOOK, abi=HOOK_ABI)
    p_hook = w3.eth.contract(address=PLAYER_HOOK, abi=HOOK_ABI)
    hook_deployer = w3.eth.contract(address=HOOK_DEPLOYER, abi=HOOK_DEPLOYER_ABI)
    
    # Check if CountryFactory exists
    country_factory_addr = "0x4fD8F53a074C25819dEb231537C53a63Bd5c14B1"
    cf_code = w3.eth.get_code(country_factory_addr)
    if cf_code and cf_code != b'0x':
        print(f"CountryFactory already deployed: {country_factory_addr}")
        country_factory = w3.eth.contract(address=country_factory_addr, abi=FACTORY_ABI)
    else:
        print("Deploying CountryFactory...")
        # Need bytecode - read from forge artifacts
        # For now, skip and ask user to run individual steps
        print("ERROR: CountryFactory not deployed. Please deploy manually.")
        sys.exit(1)
    
    print("\n=== Deployment Status ===")
    print("Use individual forge scripts or manual web3.py deployment for remaining steps.")
    print("\nAlready deployed:")
    print(f"  FanovoToken: {FANOVO_TOKEN}")
    print(f"  WorldCupHook: {WORLD_CUP_HOOK}")
    print(f"  PlayerHook: {PLAYER_HOOK}")
    print(f"  CountryFactory: {country_factory_addr}")

if __name__ == "__main__":
    main()
