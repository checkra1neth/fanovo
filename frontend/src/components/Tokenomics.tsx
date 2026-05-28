"use client";

import { useReadContract, useReadContracts } from "wagmi";
import { formatEther } from "viem";
import { CONTRACTS, COUNTRIES } from "@/lib/contracts";
import { packOpenerAbi, fanovoTokenAbi, worldCupHookAbi, playerHookAbi } from "@/lib/abi";

export function Tokenomics() {
  const { data: totalSupply } = useReadContract({
    address: CONTRACTS.fanovoToken,
    abi: fanovoTokenAbi,
    functionName: "totalSupply",
  });

  const { data: maxSupply } = useReadContract({
    address: CONTRACTS.fanovoToken,
    abi: fanovoTokenAbi,
    functionName: "MAX_SUPPLY",
  });

  const { data: packsOpened } = useReadContract({
    address: CONTRACTS.packOpener,
    abi: packOpenerAbi,
    functionName: "totalPacksOpened",
  });

  // Read all country token addresses
  const { data: tokenAddresses } = useReadContracts({
    contracts: COUNTRIES.map((country) => ({
      address: CONTRACTS.worldCupHook,
      abi: worldCupHookAbi,
      functionName: "getCountryToken" as const,
      args: [country.id] as const,
    })),
  });

  // Read all curve states for real TVL
  const { data: curveStates } = useReadContracts({
    contracts: tokenAddresses
      ? tokenAddresses.map((t) => ({
          address: CONTRACTS.worldCupHook,
          abi: worldCupHookAbi,
          functionName: "getCurveState" as const,
          args: [(t.result as `0x${string}`) || "0x0000000000000000000000000000000000000000"] as const,
        }))
      : [],
  });

  // Read player packs per country
  const { data: playerPacksData } = useReadContracts({
    contracts: COUNTRIES.map((country) => ({
      address: CONTRACTS.playerHook,
      abi: playerHookAbi,
      functionName: "packsByCountry" as const,
      args: [country.id] as const,
    })),
  });

  // Read swap fee
  const { data: swapFeeBps } = useReadContract({
    address: CONTRACTS.worldCupHook,
    abi: worldCupHookAbi,
    functionName: "SWAP_FEE_BPS",
  });

  const max = maxSupply ? Number(formatEther(maxSupply as bigint)) : 0;
  const supply = totalSupply ? Number(formatEther(totalSupply as bigint)) : 0;
  const burned = max > 0 ? max - supply : 0;
  const packs = packsOpened ? Number(packsOpened) : 0;

  // Real country TVL = sum of all realFIFA across curves
  const countryTvl = curveStates
    ? curveStates.reduce((sum, s) => {
        if (!s.result) return sum;
        const [realFIFA] = s.result as [bigint, bigint, boolean];
        return sum + Number(formatEther(realFIFA));
      }, 0)
    : 0;

  const feeBps = swapFeeBps ? Number(swapFeeBps) : 0;
  const burnPerPack = feeBps > 0 ? feeBps / 10000 : 0;
  const totalBurnedFromPacks = packs * burnPerPack;

  // Total player packs
  const totalPlayerPacks = playerPacksData
    ? playerPacksData.reduce((sum, d) => sum + (d.result ? Number(d.result) : 0), 0)
    : 0;

  const initializedCurves = curveStates
    ? curveStates.filter((s) => s.result && (s.result as [bigint, bigint, boolean])[2]).length
    : 0;

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <p className="text-[10px] text-[#ff2d55] uppercase tracking-widest font-semibold mb-1">Protocol Health</p>
          <h1 className="text-3xl font-bold">Tokenomics</h1>
          <p className="text-sm text-[#888] mt-1">
            Live protocol health for FANOVO. Every country-curve swap burns a fee in FANOVO.
            Every pack open burns a portion on the spot.
          </p>
        </div>
      </div>

      {/* Top stats row */}
      <div className="grid grid-cols-3 gap-4">
        <div className="card p-5 border-t-2 border-t-[#ff2d55]">
          <div className="flex items-center gap-2 mb-2">
            <p className="text-[10px] text-[#555] uppercase tracking-wider">Total FANOVO Burnt</p>
            <span className="text-[9px] bg-[#ff2d55]/10 text-[#ff2d55] px-1.5 py-0.5 rounded font-semibold">ON BURN</span>
          </div>
          <p className="text-2xl font-bold font-mono">{burned > 0 ? formatK(burned) : "—"} <span className="text-sm text-[#555]">FANOVO</span></p>
          <p className="text-xs text-[#555] mt-1">{max > 0 ? `${formatK(max)} max` : "—"} − supply {supply > 0 ? formatK(supply) : "—"}</p>
        </div>

        <div className="card p-5">
          <p className="text-[10px] text-[#555] uppercase tracking-wider mb-2">Burned From Packs</p>
          <p className="text-2xl font-bold font-mono">{totalBurnedFromPacks > 0 ? formatK(totalBurnedFromPacks) : "—"} <span className="text-sm text-[#555]">FANOVO</span></p>
          <p className="text-xs text-[#555] mt-1">{packs > 0 ? `${packs} packs opened` : "—"}</p>
        </div>

        <div className="card p-5">
          <p className="text-[10px] text-[#555] uppercase tracking-wider mb-2">Player Packs Opened</p>
          <p className="text-2xl font-bold font-mono">{totalPlayerPacks > 0 ? totalPlayerPacks : "—"}</p>
          <p className="text-xs text-[#555] mt-1">across 48 countries</p>
        </div>
      </div>

      {/* Second stats row */}
      <div className="grid grid-cols-3 gap-4">
        <div className="card p-5">
          <p className="text-[10px] text-[#555] uppercase tracking-wider mb-2">Country TVL</p>
          <p className="text-2xl font-bold font-mono">{countryTvl > 0 ? formatK(countryTvl) : "—"} <span className="text-sm text-[#555]">FANOVO</span></p>
          <p className="text-xs text-[#555] mt-1">{initializedCurves > 0 ? `${initializedCurves} curves initialized` : "—"}</p>
        </div>

        <div className="card p-5">
          <p className="text-[10px] text-[#555] uppercase tracking-wider mb-2">Player TVL</p>
          <p className="text-2xl font-bold font-mono">— <span className="text-sm text-[#555]">FANOVO</span></p>
          <p className="text-xs text-[#555] mt-1">Phase 1 — no player trading yet</p>
        </div>

        <div className="card p-5">
          <p className="text-[10px] text-[#555] uppercase tracking-wider mb-2">Swap Fee</p>
          <p className="text-2xl font-bold font-mono">{feeBps > 0 ? (feeBps / 100).toFixed(2) : "—"}%</p>
          <p className="text-xs text-[#555] mt-1">burned on every swap</p>
        </div>
      </div>

      {/* Third stats row */}
      <div className="grid grid-cols-3 gap-4">
        <div className="card p-5">
          <p className="text-[10px] text-[#555] uppercase tracking-wider mb-2">Country Curves</p>
          <p className="text-2xl font-bold font-mono">{initializedCurves > 0 ? initializedCurves : "—"}</p>
          <p className="text-xs text-[#555] mt-1">of 48 initialized</p>
        </div>

        <div className="card p-5">
          <p className="text-[10px] text-[#555] uppercase tracking-wider mb-2">FANOVO Supply</p>
          <p className="text-2xl font-bold font-mono">{supply > 0 ? formatK(supply) : "—"}</p>
          <p className="text-xs text-[#555] mt-1">{max > 0 ? `${formatK(max)} max` : "—"}</p>
        </div>

        <div className="card p-5">
          <p className="text-[10px] text-[#555] uppercase tracking-wider mb-2">Max Supply</p>
          <p className="text-2xl font-bold font-mono">{max > 0 ? formatK(max) : "—"}</p>
          <p className="text-xs text-[#555] mt-1">fixed at deployment</p>
        </div>
      </div>

      {/* Total Protocol TVL */}
      <div className="card p-6">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-[10px] text-[#555] uppercase tracking-wider mb-2">Total Protocol TVL</p>
            <p className="text-2xl font-bold font-mono">{countryTvl > 0 ? formatK(countryTvl) : "—"} <span className="text-sm text-[#555]">FANOVO</span></p>
            <p className="text-xs text-[#555] mt-1">country {countryTvl > 0 ? formatK(countryTvl) : "—"} + player —</p>
          </div>
          <div className="flex items-center gap-4 text-xs">
            <div className="flex items-center gap-1.5">
              <div className="w-8 h-1 bg-[#ff2d55] rounded-full" />
              <span className="text-[#888]">COUNTRY</span>
            </div>
            <div className="flex items-center gap-1.5">
              <div className="w-8 h-1 bg-[#34d399] rounded-full" />
              <span className="text-[#888]">PLAYER</span>
            </div>
          </div>
        </div>
        {/* TVL bar */}
        <div className="mt-4 h-2 bg-[#161616] rounded-full overflow-hidden">
          <div className="h-full bg-[#ff2d55] rounded-full" style={{ width: "100%" }} />
        </div>
      </div>

      {/* Live Activity */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <p className="text-[10px] text-[#555] uppercase tracking-widest">Activity</p>
          <div className="flex gap-2">
            <span className="text-[10px] bg-[#161616] border border-white/[0.08] rounded px-2 py-1 text-[#888]">All</span>
            <span className="text-[10px] bg-[#ff2d55]/10 border border-[#ff2d55]/30 rounded px-2 py-1 text-[#ff2d55]">Country burns</span>
            <span className="text-[10px] bg-[#161616] border border-white/[0.08] rounded px-2 py-1 text-[#888]">Player trades</span>
          </div>
        </div>

        <div className="card p-6">
          <p className="text-center text-sm text-[#555] py-4">No on-chain activity to display. Trade history requires an indexer or event scanning.</p>
        </div>
      </div>
    </div>
  );
}

function formatK(n: number): string {
  if (n >= 1000000) return (n / 1000000).toFixed(2) + "M";
  if (n >= 1000) return (n / 1000).toFixed(1) + "K";
  return n.toFixed(2);
}
