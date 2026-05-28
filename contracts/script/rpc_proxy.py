#!/usr/bin/env python3
"""
X Layer RPC Proxy for Foundry

Problem: X Layer returns non-standard receipt/block fields that Alloy can't parse.
Specifically: feePayer (sometimes missing), timestampMillis (sometimes missing).

Solution: Intercept ALL responses and inject default values for these fields.
"""

import json
import sys
import threading
import time
from http.server import BaseHTTPRequestHandler, HTTPServer
import urllib.request
import urllib.error

# Target RPC
TARGET_RPC = "https://xlayer-mainnet.g.alchemy.com/v2/REDACTED_ALCHEMY_KEY"
# Backup RPC if primary fails
BACKUP_RPC = "https://rpc.xlayer.tech"

# Fields required by Foundry/Alloy for X Layer compatibility
RECEIPT_REQUIRED = {"feePayer": "0x0000000000000000000000000000000000000000"}
BLOCK_REQUIRED = {"timestampMillis": "0x0"}

def fix_object(obj):
    """Recursively fix objects in JSON response."""
    if isinstance(obj, dict):
        # Check if this is a receipt (has transactionHash + status)
        if "transactionHash" in obj and "status" in obj:
            for key, default in RECEIPT_REQUIRED.items():
                if key not in obj:
                    obj[key] = default
            # Also fix nested logs
            if "logs" in obj and isinstance(obj["logs"], list):
                for log in obj["logs"]:
                    if isinstance(log, dict):
                        for key, default in RECEIPT_REQUIRED.items():
                            if key not in log:
                                log[key] = default
        
        # Check if this is a block (has hash + number + miner)
        if "hash" in obj and "number" in obj and "miner" in obj:
            for key, default in BLOCK_REQUIRED.items():
                if key not in obj:
                    obj[key] = default
        
        # Check if this is a log (has address + topics)
        if "address" in obj and "topics" in obj:
            for key, default in RECEIPT_REQUIRED.items():
                if key not in obj:
                    obj[key] = default
        
        # Recurse into all values
        for key, val in list(obj.items()):
            if isinstance(val, (dict, list)):
                fix_object(val)
    
    elif isinstance(obj, list):
        for item in obj:
            fix_object(item)
    
    return obj

class ProxyHandler(BaseHTTPRequestHandler):
    def do_POST(self):
        content_length = int(self.headers.get('Content-Length', 0))
        body = self.rfile.read(content_length)
        
        # Try primary RPC
        response_body = self._forward_request(TARGET_RPC, body)
        
        # If failed, try backup
        if response_body is None:
            response_body = self._forward_request(BACKUP_RPC, body)
        
        if response_body is None:
            self._send_error("Failed to forward request to both RPCs")
            return
        
        # Parse and fix response
        try:
            data = json.loads(response_body)
            fix_object(data)
            response_body = json.dumps(data).encode()
        except json.JSONDecodeError:
            # If it's not valid JSON, just pass through
            pass
        
        self.send_response(200)
        self.send_header('Content-Type', 'application/json')
        self.send_header('Content-Length', str(len(response_body)))
        self.send_header('Access-Control-Allow-Origin', '*')
        self.end_headers()
        self.wfile.write(response_body)
    
    def _forward_request(self, rpc_url, body):
        """Forward request to RPC and return response body."""
        try:
            req = urllib.request.Request(
                rpc_url,
                data=body,
                headers={
                    'Content-Type': 'application/json',
                    'User-Agent': 'foundry-xlayer-proxy/1.0',
                    'Accept': 'application/json'
                },
                method='POST'
            )
            with urllib.request.urlopen(req, timeout=120) as resp:
                return resp.read()
        except Exception as e:
            print(f"  RPC {rpc_url} error: {e}", file=sys.stderr)
            return None
    
    def _send_error(self, message):
        self.send_response(500)
        self.send_header('Content-Type', 'application/json')
        self.end_headers()
        self.wfile.write(json.dumps({
            "jsonrpc": "2.0",
            "error": {"code": -32603, "message": message},
            "id": None
        }).encode())
    
    def log_message(self, format, *args):
        # Suppress access logs to reduce noise
        pass

class ThreadedHTTPServer(HTTPServer):
    allow_reuse_address = True
    daemon_threads = True

def main():
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 8545
    server = ThreadedHTTPServer(("127.0.0.1", port), ProxyHandler)
    print(f"✓ X Layer Proxy listening on http://127.0.0.1:{port}")
    print(f"  Primary RPC: {TARGET_RPC[:60]}...")
    print(f"  Backup RPC:  {BACKUP_RPC}")
    print(f"  Fixing: feePayer, timestampMillis")
    print()
    print("Use with: forge script ... --rpc-url http://127.0.0.1:8545")
    print()
    
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\nShutting down proxy...")
        server.shutdown()

if __name__ == "__main__":
    main()
