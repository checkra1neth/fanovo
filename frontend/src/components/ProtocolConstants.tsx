"use client";

import { useReadContract } from "wagmi";
import { formatEther } from "viem";
import { CONTRACTS } from "@/lib/contracts";
import { packOpenerAbi, fanovoTokenAbi, worldCupHookAbi } from "@/lib/abi";

export function useProtocolConstants() {
  const { data: maxSupply } = useReadContract({
    address: CONTRACTS.fanovoToken,
    abi: fanovoTokenAbi,
    functionName: "MAX_SUPPLY",
  });

  const { data: maxPacks } = useReadContract({
    address: CONTRACTS.packOpener,
    abi: packOpenerAbi,
    functionName: "MAX_PACKS",
  });

  const { data: virtualFifa } = useReadContract({
    address: CONTRACTS.worldCupHook,
    abi: worldCupHookAbi,
    functionName: "VIRTUAL_FANOVO",
  });

  const { data: swapFeeBps } = useReadContract({
    address: CONTRACTS.worldCupHook,
    abi: worldCupHookAbi,
    functionName: "SWAP_FEE_BPS",
  });

  const { data: bpsDenom } = useReadContract({
    address: CONTRACTS.worldCupHook,
    abi: worldCupHookAbi,
    functionName: "BPS_DENOM",
  });

  const maxSupplyNum = maxSupply ? Number(formatEther(maxSupply as bigint)) : 0;
  const maxPacksNum = maxPacks ? Number(maxPacks) : 0;
  const asymptoteNum = virtualFifa ? Number(formatEther(virtualFifa as bigint)) : 0;
  const feePct = swapFeeBps && bpsDenom ? (Number(swapFeeBps) / Number(bpsDenom)) * 100 : 0;

  return {
    maxSupply: maxSupplyNum,
    maxPacks: maxPacksNum,
    asymptote: asymptoteNum,
    feePct,
    loading: !maxSupply || !maxPacks || !virtualFifa || !swapFeeBps,
  };
}
