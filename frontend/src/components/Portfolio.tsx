"use client";

import { useAccount, useReadContract, useReadContracts } from "wagmi";
import { formatEther } from "viem";
import { CONTRACTS, COUNTRIES, PLAYERS, getFlagUrl } from "@/lib/contracts";
import { packOpenerAbi, worldCupHookAbi, fanovoTokenAbi, playerHookAbi } from "@/lib/abi";
import Link from "next/link";
import { useState } from "react";

export function Portfolio() {
  const { address, isConnected } = useAccount();
  const [activeTab, setActiveTab] = useState<"countries" | "players">("countries");

  // Read player token addresses via allPlayers
  const { data: playerTokenAddresses } = useReadContracts({
    contracts: PLAYERS.map((player) => ({
      address: CONTRACTS.playerHook,
      abi: playerHookAbi,
      functionName: "allPlayers" as const,
      args: [BigInt(player.countryId * 3 + player.role)] as const,
    })),
  });

  // Read player token balances
  const { data: playerBalances } = useReadContracts({
    contracts: playerTokenAddresses
      ? playerTokenAddresses.map((t) => ({
          address: (t.result as `0x${string}`) || "0x0000000000000000000000000000000000000000",
          abi: fanovoTokenAbi,
          functionName: "balanceOf" as const,
          args: [address || "0x0000000000000000000000000000000000000000"] as const,
        }))
      : [],
  });

  // Read phase2 status for all countries
  const { data: phase2CountriesData } = useReadContracts({
    contracts: COUNTRIES.map((country) => ({
      address: CONTRACTS.playerHook,
      abi: playerHookAbi,
      functionName: "phase2ByCountry" as const,
      args: [country.id] as const,
    })),
  });

  const { data: fanovoBalance } = useReadContract({
    address: CONTRACTS.fanovoToken,
    abi: fanovoTokenAbi,
    functionName: "balanceOf",
    args: address ? [address] : undefined,
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

  // Read balances
  const { data: balances } = useReadContracts({
    contracts: tokenAddresses
      ? tokenAddresses.map((t) => ({
          address: (t.result as `0x${string}`) || "0x0000000000000000000000000000000000000000",
          abi: fanovoTokenAbi,
          functionName: "balanceOf" as const,
          args: [address || "0x0000000000000000000000000000000000000000"] as const,
        }))
      : [],
  });

  // Read prices via PackOpener
  const { data: prices } = useReadContracts({
    contracts: COUNTRIES.map((country) => ({
      address: CONTRACTS.packOpener,
      abi: packOpenerAbi,
      functionName: "getPrice" as const,
      args: [BigInt(country.id)] as const,
    })),
  });

  // Read player packs opened per country
  const { data: playerPacksData } = useReadContracts({
    contracts: COUNTRIES.map((country) => ({
      address: CONTRACTS.playerHook,
      abi: playerHookAbi,
      functionName: "packsByCountry" as const,
      args: [country.id] as const,
    })),
  });

  if (!isConnected) {
    return (
      <div className="text-center py-20">
        <p className="text-3xl mb-4">👛</p>
        <h2 className="text-xl font-bold mb-2">Connect your wallet</h2>
        <p className="text-[#888]">Connect to view your portfolio</p>
      </div>
    );
  }

  const holdings = COUNTRIES.map((country, i) => {
    const balance = balances?.[i]?.result;
    const amount = balance ? Number(formatEther(balance as bigint)) : 0;
    const price = prices?.[i]?.result ? Number(formatEther(prices[i].result as bigint)) : 0;
    const value = amount * price;
    return { ...country, amount, price, value };
  });

  const owned = holdings.filter((h) => h.amount > 0);
  const totalValue = owned.reduce((s, h) => s + h.value, 0);
  const userFanovo = fanovoBalance ? Number(formatEther(fanovoBalance as bigint)) : 0;

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Portfolio</h1>
          <p className="text-sm text-[#888] mt-1">Your country-token positions across the set.</p>
        </div>
        <div className="flex rounded-lg overflow-hidden border border-white/[0.08]">
          <button
            onClick={() => setActiveTab("countries")}
            className={`px-4 py-2 text-xs font-semibold ${
              activeTab === "countries" ? "bg-[#ff2d55] text-white" : "text-[#555]"
            }`}
          >
            COUNTRIES <span className="opacity-70">{owned.length}</span>
          </button>
          <button
            onClick={() => setActiveTab("players")}
            className={`px-4 py-2 text-xs font-medium ${
              activeTab === "players" ? "bg-[#ff2d55] text-white" : "text-[#555]"
            }`}
          >
            PLAYERS <span className="opacity-70">{playerBalances?.filter((b) => b.result && Number(formatEther(b.result as bigint)) > 0).length || 0}</span>
          </button>
        </div>
      </div>

      {activeTab === "countries" && (
        <>
          {/* Stats */}
          <div className="grid grid-cols-3 gap-4">
            <div className="card p-5">
              <p className="text-[10px] text-[#555] uppercase tracking-wider mb-1">Total Value</p>
              <p className="text-2xl font-bold font-mono">{totalValue.toFixed(2)}</p>
              <p className="text-xs text-[#555]">FANOVO</p>
            </div>
            <div className="card p-5">
              <p className="text-[10px] text-[#555] uppercase tracking-wider mb-1">Set Completion</p>
              <p className="text-2xl font-bold font-mono">{owned.length} <span className="text-[#555] text-lg">/ 48</span></p>
            </div>
            <div className="card p-5">
              <p className="text-[10px] text-[#555] uppercase tracking-wider mb-1">Packs Opened</p>
              <p className="text-2xl font-bold font-mono">{packsOpened ? Number(packsOpened).toString() : "0"}</p>
              <p className="text-xs text-[#555]">{userFanovo.toFixed(0)} FANOVO remaining</p>
            </div>
          </div>

          {/* Set Progress */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <p className="text-[10px] text-[#555] uppercase tracking-widest">Set Progress</p>
              <p className="text-xs text-[#555]">{48 - owned.length} remaining</p>
            </div>
            <div className="grid gap-1.5" style={{ gridTemplateColumns: "repeat(24, 1fr)" }}>
              {holdings.map((country) => (
                <img
                  key={country.id}
                  src={getFlagUrl(country.symbol)}
                  alt={country.name}
                  title={`${country.name}${country.amount > 0 ? ` (${country.amount.toFixed(0)})` : ""}`}
                  className={`w-full h-5 rounded object-cover ${country.amount > 0 ? "opacity-100" : "opacity-20"}`}
                />
              ))}
            </div>
          </div>

          {/* Positions */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <p className="text-[10px] text-[#555] uppercase tracking-widest">Positions ({owned.length})</p>
              <div className="relative">
                <select className="appearance-none bg-[#0d0d0d] border border-white/[0.08] rounded-lg pl-3 pr-7 py-1.5 text-xs text-[#888] outline-none" style={{ colorScheme: "dark" }}>
                  <option>Sort: Value</option>
                  <option>Sort: Amount</option>
                  <option>Sort: Name</option>
                </select>
                <span className="absolute right-2 top-1/2 -translate-y-1/2 text-[#555] pointer-events-none text-[10px]">▾</span>
              </div>
            </div>

            {owned.length > 0 ? (
              <div className="card overflow-hidden">
                {owned.sort((a, b) => b.value - a.value).map((country) => (
                  <div key={country.id} className="flex items-center px-5 py-4 border-b border-white/[0.03] hover:bg-white/[0.02] transition-colors">
                    <div className="flex items-center gap-3 flex-1">
                      <img src={getFlagUrl(country.symbol)} alt="" className="w-8 h-5 rounded object-cover" />
                      <div>
                        <p className="text-sm font-medium">{country.name}</p>
                        <p className="text-[11px] text-[#555]">{country.symbol}</p>
                      </div>
                    </div>
                    <div className="w-24 text-right">
                      <p className="text-sm font-mono">{country.amount.toFixed(2)}</p>
                      <p className="text-[11px] text-[#555]">tokens</p>
                    </div>
                    <div className="w-28 text-right">
                      <p className="text-sm font-mono">{country.price.toFixed(4)}</p>
                      <p className="text-[11px] text-[#555]">FANOVO/token</p>
                    </div>
                    <div className="w-28 text-right">
                      <p className="text-sm font-mono font-semibold">{country.value.toFixed(4)}</p>
                      <p className="text-[11px] text-[#555]">FANOVO value</p>
                    </div>
                    <div className="w-20 text-right pl-3">
                      <span className="text-xs text-[#555]">Phase 2</span>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="card p-10 text-center">
                <p className="text-sm text-[#888] mb-3">No positions yet. Open a pack to begin.</p>
                <Link href="/pack" className="text-xs text-[#ff2d55] hover:underline uppercase tracking-wider font-semibold">
                  Open a Pack →
                </Link>
              </div>
            )}
          </div>
        </>
      )}

      {activeTab === "players" && (
        <div className="space-y-6">
          {/* Player Stats */}
          {(() => {
            const playerHoldings = PLAYERS.map((player, i) => {
              const balance = playerBalances?.[i]?.result;
              const amount = balance ? Number(formatEther(balance as bigint)) : 0;
              const phase2 = phase2CountriesData?.[player.countryId]?.result ? Boolean(phase2CountriesData[player.countryId].result) : false;
              return { ...player, amount, phase2 };
            });
            const ownedPlayers = playerHoldings.filter((p) => p.amount > 0);
            
            return (
              <>
                <div className="grid grid-cols-3 gap-4">
                  <div className="card p-5">
                    <p className="text-[10px] text-[#555] uppercase tracking-wider mb-1">Player Tokens</p>
                    <p className="text-2xl font-bold font-mono">{ownedPlayers.length}</p>
                    <p className="text-xs text-[#555]">of 144 collected</p>
                  </div>
                  <div className="card p-5">
                    <p className="text-[10px] text-[#555] uppercase tracking-wider mb-1">Countries Active</p>
                    <p className="text-2xl font-bold font-mono">
                      {phase2CountriesData?.filter((d) => Boolean(d.result)).length || 0}
                    </p>
                    <p className="text-xs text-[#555]">of 48 in Phase 2</p>
                  </div>
                  <div className="card p-5">
                    <p className="text-[10px] text-[#555] uppercase tracking-wider mb-1">Packs Opened</p>
                    <p className="text-2xl font-bold font-mono">
                      {playerPacksData?.reduce((sum, d) => sum + (d.result ? Number(d.result) : 0), 0) || 0}
                    </p>
                    <p className="text-xs text-[#555]">player packs</p>
                  </div>
                </div>

                {/* Player Positions */}
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <p className="text-[10px] text-[#555] uppercase tracking-widest">Player Positions ({ownedPlayers.length})</p>
                    <Link href="/markets" className="text-xs text-[#ff2d55] hover:underline uppercase tracking-wider font-semibold">
                      Open Player Pack →
                    </Link>
                  </div>

                  {ownedPlayers.length > 0 ? (
                    <div className="card overflow-hidden">
                      {ownedPlayers.map((player) => {
                        const country = COUNTRIES[player.countryId];
                        const roleLabel = player.role === 0 ? "CAPTAIN" : player.role === 1 ? "BEST" : "ROOKIE";
                        return (
                          <div key={`${player.countryId}-${player.role}`} className="flex items-center px-5 py-4 border-b border-white/[0.03] hover:bg-white/[0.02] transition-colors">
                            <div className="flex items-center gap-3 flex-1">
                              <img src={getFlagUrl(country.symbol)} alt="" className="w-8 h-5 rounded object-cover" />
                              <div>
                                <p className="text-sm font-medium">{player.name}</p>
                                <p className="text-[11px] text-[#555]">{player.symbol} · {roleLabel} · {country.symbol}</p>
                              </div>
                            </div>
                            <div className="w-24 text-right">
                              <p className="text-sm font-mono">{player.amount.toFixed(2)}</p>
                              <p className="text-[11px] text-[#555]">tokens</p>
                            </div>
                            <div className="w-20 text-right pl-3">
                              {player.phase2 ? (
                                <span className="text-xs text-[#34d399]">Trading</span>
                              ) : (
                                <span className="text-xs text-[#555]">Phase 2</span>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  ) : (
                    <div className="card p-10 text-center">
                      <p className="text-sm text-[#888] mb-3">No player tokens yet. Open a country pack, then open player packs.</p>
                      <div className="flex gap-4 justify-center">
                        <Link href="/pack" className="text-xs text-[#ff2d55] hover:underline uppercase tracking-wider font-semibold">
                          Open Country Pack →
                        </Link>
                        <Link href="/markets" className="text-xs text-[#ff2d55] hover:underline uppercase tracking-wider font-semibold">
                          Open Player Pack →
                        </Link>
                      </div>
                    </div>
                  )}
                </div>
              </>
            );
          })()}
        </div>
      )}
    </div>
  );
}


