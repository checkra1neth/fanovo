#!/usr/bin/env python3
"""
Hook Salt Miner for Uniswap V4
Mines CREATE2 salts to produce hook addresses with correct permission bits.

Target permission mask: 0x2aa8
Flags:
  - beforeInitialize (bit 13)
  - beforeAddLiquidity (bit 11)
  - beforeRemoveLiquidity (bit 9)
  - beforeSwap (bit 7)
  - beforeDonate (bit 5)
  - beforeSwapReturnDelta (bit 3)

Usage:
  python3 script/mine_salt.py <hook_deployer_address> <constructor_args_hex>
  
Example:
  python3 script/mine_salt.py 0x1234... 0xabcd...
"""

import sys
from Crypto.Hash import keccak as keccak_hash
import eth_abi

def keccak_256(data: bytes) -> bytes:
    h = keccak_hash.new(digest_bits=256)
    h.update(data)
    return h.digest()

# Target lower 14 bits (matches PITCH hooks)
TARGET_MASK = 0x2aa8
ALL_HOOK_MASK = 0x3FFF

def mine_salt(deployer: str, init_code_hash: bytes, start: int = 0, max_iter: int = 10_000_000):
    """Mine a salt that produces an address with TARGET_MASK lower bits."""
    deployer_bytes = bytes.fromhex(deployer.replace("0x", ""))
    
    for i in range(start, start + max_iter):
        salt = i.to_bytes(32, "big")
        # CREATE2 address formula
        hash_input = b"\xff" + deployer_bytes + salt + init_code_hash
        hash_output = keccak_256(hash_input)
        addr = hash_output[12:]  # last 20 bytes
        addr_int = int.from_bytes(addr, "big")
        lower_bits = addr_int & ALL_HOOK_MASK
        
        if lower_bits == TARGET_MASK:
            return salt, addr
        
        if i % 100_000 == 0 and i > 0:
            print(f"  Tried {i} salts...", file=sys.stderr)
    
    return None, None


def main():
    if len(sys.argv) < 3:
        print("Usage: python3 mine_salt.py <deployer_address> <creation_code_hex>")
        print("  deployer_address: HookDeployer contract address")
        print("  creation_code_hex: Hex string of creation code + constructor args")
        sys.exit(1)
    
    deployer = sys.argv[1]
    creation_code = bytes.fromhex(sys.argv[2].replace("0x", ""))
    
    # Compute init code hash
    init_code_hash = keccak_256(creation_code)
    print(f"Deployer: {deployer}")
    print(f"Init code hash: 0x{init_code_hash.hex()}")
    print(f"Target mask: 0x{TARGET_MASK:04x}")
    print("Mining...")
    
    salt, addr = mine_salt(deployer, init_code_hash)
    
    if salt is None:
        print("ERROR: Could not find a valid salt within iteration limit.")
        sys.exit(1)
    
    print(f"\n✅ Found valid salt!")
    print(f"Salt: 0x{salt.hex()}")
    print(f"Address: 0x{addr.hex()}")
    print(f"Lower 14 bits: 0x{int.from_bytes(addr, 'big') & ALL_HOOK_MASK:04x}")


if __name__ == "__main__":
    main()
