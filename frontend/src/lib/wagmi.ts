import { http, createConfig } from "wagmi";
import { defineChain } from "viem";

export const xlayer = defineChain({
  id: 196,
  name: "X Layer",
  nativeCurrency: { name: "OKB", symbol: "OKB", decimals: 18 },
  rpcUrls: {
    default: { http: ["/api/rpc"] },
  },
  blockExplorers: {
    default: { name: "OKX Explorer", url: "https://www.okx.com/web3/explorer/xlayer" },
  },
});

// Block explorer URL for an address on X Layer Mainnet.
export function explorerAddressUrl(address: string): string {
  return `https://www.okx.com/web3/explorer/xlayer/address/${address}`;
}

export const config = createConfig({
  chains: [xlayer],
  transports: {
    [xlayer.id]: http(),
  },
});
