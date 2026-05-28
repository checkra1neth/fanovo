import { http, createConfig } from "wagmi";
import { defineChain } from "viem";

export const xlayerTestnet = defineChain({
  id: 196,
  name: "X Layer",
  nativeCurrency: { name: "OKB", symbol: "OKB", decimals: 18 },
  rpcUrls: {
    default: { http: ["https://rpc.xlayer.tech"] },
  },
  blockExplorers: {
    default: { name: "OKX Explorer", url: "https://www.okx.com/web3/explorer/xlayer" },
  },
});

export const config = createConfig({
  chains: [xlayerTestnet],
  transports: {
    [xlayerTestnet.id]: http(),
  },
});
