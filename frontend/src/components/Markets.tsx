"use client";

import { useState } from "react";
import { useReadContract, useReadContracts } from "wagmi";
import { formatEther } from "viem";
import { CONTRACTS, COUNTRIES, PLAYERS, getFlagUrl } from "@/lib/contracts";
import { packOpenerAbi, worldCupHookAbi, fanovoTokenAbi } from "@/lib/abi";
import Link from "next/link";

export function Markets() {
  const [search, setSearch] = useState("");
  const [sort, setSort] = useState<"marketcap" | "price" | "name">("marketcap");
  const [activeTab, setActiveTab] = useState<"countries" | "players" | "packs">("countries");
  const [playerFilter, setPlayerFilter] = useState<"all" | "captain" | "best" | "rookie">("all");
  const [playerSearch, setPlayerSearch] = useState("");

  // Read total supply
  const { data: totalSupply } = useReadContract({
    address: CONTRACTS.fanovoToken,
    abi: fanovoTokenAbi,
    functionName: "totalSupply",
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

  // Read country token addresses
  const { data: tokenAddresses } = useReadContracts({
    contracts: COUNTRIES.map((country) => ({
      address: CONTRACTS.worldCupHook,
      abi: worldCupHookAbi,
      functionName: "getCountryToken" as const,
      args: [BigInt(country.id)] as const,
    })),
  });

  // Read curve state for each country
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

  const PACKS_THRESHOLD = 450;

  const countriesWithData = COUNTRIES.map((country, i) => {
    const price = prices?.[i]?.result
      ? Number(formatEther(prices[i].result as bigint))
      : 0;
    const curveData = curveStates?.[i]?.result as [bigint, bigint, boolean] | undefined;
    const tvl = curveData ? Number(formatEther(curveData[0])) : 0;
    const supply = curveData ? Number(formatEther(curveData[1])) : 0;
    const marketCap = price * supply;
    const countryPacks = curveData ? Number(formatEther(curveData[1])) : 0;
    const phase2Active = countryPacks >= PACKS_THRESHOLD;
    return { ...country, price, tvl, supply, marketCap, countryPacks, phase2Active };
  });

  // Sort
  const sorted = [...countriesWithData].sort((a, b) => {
    if (sort === "marketcap") return b.marketCap - a.marketCap;
    if (sort === "price") return b.price - a.price;
    return a.name.localeCompare(b.name);
  });

  // Filter
  const filtered = sorted.filter(
    (c) =>
      c.name.toLowerCase().includes(search.toLowerCase()) ||
      c.symbol.toLowerCase().includes(search.toLowerCase())
  );

  const totalTvl = countriesWithData.reduce((s, c) => s + c.tvl, 0);

  // Top 3 by TVL (real on-chain data)
  const trending = [...countriesWithData].sort((a, b) => b.tvl - a.tvl).slice(0, 3);

  return (
    <div className="space-y-6">
      {/* Page header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Markets</h1>
          <p className="text-sm text-[#888] mt-1">
            48 country curves quoted in FANOVO. 5% burn on every swap.
          </p>
        </div>
        <div className="text-right">
          <p className="text-xs text-[#555] uppercase tracking-wider">TVL</p>
          <p className="text-2xl font-bold font-mono">
            {totalTvl.toFixed(0)}{" "}
            <span className="text-sm text-[#555]">FANOVO</span>
          </p>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-4 border-b border-white/[0.06] pb-0">
        {([
          { key: "countries", label: "Countries" },
          { key: "players", label: "Players" },
          { key: "packs", label: "Open packs" },
        ] as const).map((t) => (
          <button
            key={t.key}
            onClick={() => setActiveTab(t.key)}
            className={`pb-3 text-sm font-medium transition-colors ${
              activeTab === t.key
                ? "text-white border-b-2 border-[#ff2d55]"
                : "text-[#555] hover:text-[#888]"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {activeTab === "players" && (
        <div className="space-y-4">
          <p className="text-sm text-[#888]">
            144 player tokens, each on its own bonding curve. Trades settle in the matching country token with a 5% burn on every swap.
          </p>
          
          {/* Filters */}
          <div className="flex items-center gap-3">
            <input
              type="text"
              placeholder="⌕ Search player or country..."
              value={playerSearch}
              onChange={(e) => setPlayerSearch(e.target.value)}
              className="flex-1 max-w-sm bg-[#0d0d0d] border border-white/[0.08] rounded-lg px-4 py-2.5 text-sm text-white placeholder-[#555] outline-none focus:border-white/[0.15]"
            />
            <div className="flex gap-1">
              {(["all", "captain", "best", "rookie"] as const).map((f) => (
                <button
                  key={f}
                  onClick={() => setPlayerFilter(f)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-medium capitalize transition-colors ${
                    playerFilter === f
                      ? "bg-[#ff2d55] text-white"
                      : "bg-[#161616] text-[#555] hover:text-[#888]"
                  }`}
                >
                  {f}
                </button>
              ))}
            </div>
          </div>

          {/* Players table */}
          <div className="card overflow-hidden">
            {/* Header */}
            <div className="flex items-center px-6 py-3 border-b border-white/[0.06] text-[11px] text-[#555] uppercase tracking-wider font-medium">
              <div className="flex-1">Player</div>
              <div className="w-36 text-right">Price</div>
              <div className="w-36 text-right hidden md:block">Market Cap</div>
              <div className="w-32 text-right hidden lg:block">Liquidity</div>
              <div className="w-20 text-right">Trade</div>
            </div>

            {/* Player rows */}
            {PLAYERS.filter((p) => {
              if (playerFilter !== "all") {
                const roleMap = { captain: 0, best: 1, rookie: 2 };
                if (p.role !== roleMap[playerFilter]) return false;
              }
              if (playerSearch) {
                const s = playerSearch.toLowerCase();
                const country = COUNTRIES[p.countryId];
                return (
                  p.name.toLowerCase().includes(s) ||
                  country?.name.toLowerCase().includes(s) ||
                  country?.symbol.toLowerCase().includes(s)
                );
              }
              return true;
            }).map((player) => {
              const country = COUNTRIES[player.countryId];
              const roleLabel = player.role === 0 ? "CAPTAIN" : player.role === 1 ? "BEST" : "ROOKIE";
              const countryData = countriesWithData[player.countryId];
              const canTrade = countryData?.phase2Active;
              const packsOpened = countryData?.countryPacks || 0;
              return (
                <div
                  key={`${player.countryId}-${player.role}`}
                  className="flex items-center px-6 py-4 border-b border-white/[0.03] hover:bg-white/[0.02] transition-colors"
                >
                  {/* Player */}
                  <div className="flex-1 flex items-center gap-3">
                    <img
                      src={getFlagUrl(country.symbol)}
                      alt={country.name}
                      className="w-8 h-6 rounded object-cover"
                    />
                  <div>
                    <p className="text-sm font-medium">{player.name}</p>
                    <p className="text-[11px] text-[#555]">
                      {player.symbol} · {roleLabel} · {country.symbol}
                    </p>
                  </div>
                  </div>

                  {/* Price */}
                  <div className="w-36 text-right">
                    {canTrade ? (
                      <p className="text-sm font-mono">Live <span className="text-[#555] text-xs">{country.symbol}</span></p>
                    ) : (
                      <p className="text-sm font-mono">— <span className="text-[#555] text-xs">{country.symbol}</span></p>
                    )}
                    <p className="text-[11px] text-[#555]">{packsOpened}/{PACKS_THRESHOLD} country packs</p>
                  </div>

                  {/* Market Cap */}
                  <div className="w-36 text-right hidden md:block">
                    {canTrade ? (
                      <p className="text-sm font-mono">Live</p>
                    ) : (
                      <p className="text-sm font-mono">—</p>
                    )}
                    <p className="text-[11px] text-[#555]">{canTrade ? "Trading" : "Phase 2"}</p>
                  </div>

                  {/* Liquidity */}
                  <div className="w-32 text-right hidden lg:block">
                    {canTrade ? (
                      <p className="text-sm font-mono">Live</p>
                    ) : (
                      <p className="text-sm font-mono">—</p>
                    )}
                    <p className="text-[11px] text-[#555]">{canTrade ? "Active" : "Packs"}</p>
                  </div>

                  {/* Trade */}
                  <div className="w-20 text-right">
                    {canTrade ? (
                      <Link href={`/trade/player/${player.countryId}/${player.role}`} className="btn-trade text-xs">Trade</Link>
                    ) : (
                      <span className="text-xs text-[#555]">Phase 2</span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {activeTab === "packs" && (
        <div className="space-y-4">
          <p className="text-sm text-[#888]">
            48 player tokens per country — Captain, Best, Rookie. Each trades on its own bonding curve, priced against its country token. 450 packs per country before trading opens.
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
            {countriesWithData.map((country) => {
              const progress = PACKS_THRESHOLD > 0 ? (country.countryPacks / PACKS_THRESHOLD) * 100 : 0;
              const isOpen = country.phase2Active;
              const countryPlayers = PLAYERS.filter((p) => p.countryId === country.id);
              return (
                <Link
                  key={country.id}
                  href={`/markets/players/${country.id}`}
                  className="card p-4 space-y-3 block hover:border-[#ff2d55]/40 transition-colors"
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <img src={getFlagUrl(country.symbol)} alt="" className="w-7 h-5 rounded object-cover" />
                      <span className="font-semibold text-sm">{country.name}</span>
                    </div>
                    {isOpen ? (
                      <span className="text-[10px] bg-[#34d399]/10 text-[#34d399] px-2 py-0.5 rounded font-semibold">TRADING</span>
                    ) : (
                      <span className="text-[10px] bg-[#ff2d55]/10 text-[#ff2d55] px-2 py-0.5 rounded font-semibold">PACKS</span>
                    )}
                  </div>
                  <div className="flex justify-between text-xs">
                    <span className="text-[#555]">Pack progress</span>
                    <span className="font-mono">{country.countryPacks} / {PACKS_THRESHOLD}</span>
                  </div>
                  <div className="h-1.5 bg-[#161616] rounded-full overflow-hidden border border-white/[0.04]">
                    <div
                      className="h-full bg-[#ff2d55] rounded-full transition-all"
                      style={{ width: `${Math.max(Math.min(progress, 100), 0.5)}%` }}
                    />
                  </div>
                  <div className="flex justify-between text-[11px] text-[#555]">
                    <span>Phase 2</span>
                    <span>{isOpen ? "Live trading" : `${PACKS_THRESHOLD - country.countryPacks} country packs left`}</span>
                  </div>
                  <div className="space-y-1.5 pt-1">
                    {countryPlayers.map((player) => {
                      const roleColor = player.role === 0 ? "text-yellow-400" : player.role === 1 ? "text-blue-400" : "text-green-400";
                      const roleLabel = player.role === 0 ? "CAPTAIN" : player.role === 1 ? "BEST" : "ROOKIE";
                      return (
                        <div key={player.symbol} className="flex items-center gap-2">
                          <span className={`text-[10px] ${roleColor} w-14`}>{roleLabel}</span>
                          <span className="text-xs text-[#aaa]">{player.name}</span>
                        </div>
                      );
                    })}
                  </div>
                </Link>
              );
            })}
          </div>
        </div>
      )}

      {activeTab === "countries" && (<>
      {/* Three widget row */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* Protocol Stats */}
        <div className="card p-5">
          <div className="flex items-center justify-between mb-3">
            <p className="text-[10px] text-[#555] uppercase tracking-wider">FANOVO Supply</p>
          </div>
          <div className="space-y-3">
            <div>
              <p className="text-[10px] text-[#555]">Total Supply</p>
              <div className="flex items-center gap-2">
                <p className="text-lg font-bold font-mono">
                  {totalSupply ? Number(formatEther(totalSupply as bigint)).toLocaleString() : "—"}
                </p>
                <span className="text-xs text-[#555]">FANOVO</span>
              </div>
            </div>
            <div>
              <p className="text-[10px] text-[#555]">Total Protocol TVL</p>
              <div className="flex items-center gap-2">
                <p className="text-lg font-bold font-mono">{totalTvl.toLocaleString()}</p>
                <span className="text-xs text-[#555]">FANOVO</span>
              </div>
            </div>
          </div>
        </div>

        {/* Trending by TVL */}
        <div className="card p-5">
          <div className="flex items-center justify-between mb-3">
            <p className="text-[10px] text-[#555] uppercase tracking-wider">Top by TVL</p>
          </div>
          <div className="space-y-2.5">
            {trending.map((country) => (
              <div key={country.id} className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <img src={getFlagUrl(country.symbol)} alt="" className="w-6 h-4 rounded object-cover" />
                  <div>
                    <p className="text-sm font-medium">{country.name}</p>
                    <p className="text-[10px] text-[#555]">{country.symbol}</p>
                  </div>
                </div>
                <div className="text-right">
                  <p className="text-sm font-mono">{country.tvl.toFixed(0)}</p>
                  <p className="text-[10px] text-[#555]">FANOVO</p>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Top by Price */}
        <div className="card p-5">
          <div className="flex items-center justify-between mb-3">
            <p className="text-[10px] text-[#555] uppercase tracking-wider">Top by Price</p>
          </div>
          <div className="space-y-2.5">
            {[...countriesWithData].sort((a, b) => b.price - a.price).slice(0, 3).map((country) => (
              <div key={country.id} className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <img src={getFlagUrl(country.symbol)} alt="" className="w-6 h-4 rounded object-cover" />
                  <div>
                    <p className="text-sm font-medium">{country.name}</p>
                    <p className="text-[10px] text-[#555]">{country.symbol}</p>
                  </div>
                </div>
                <div className="text-right">
                  <p className="text-sm font-mono">{country.price > 0 ? country.price.toFixed(4) : "—"}</p>
                  <p className="text-[10px] text-[#555]">FANOVO</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Search + Sort */}
      <div className="flex items-center justify-between gap-4">
        <div className="flex-1 max-w-sm">
          <input
            type="text"
            placeholder="⌕ Search country..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full bg-[#0d0d0d] border border-white/[0.08] rounded-lg px-4 py-2.5 text-sm text-white placeholder-[#555] outline-none focus:border-white/[0.15]"
          />
        </div>
        <div className="relative">
          <select
            value={sort}
            onChange={(e) => setSort(e.target.value as typeof sort)}
            className="appearance-none bg-[#0d0d0d] border border-white/[0.08] rounded-lg pl-4 pr-8 py-2.5 text-sm text-[#888] outline-none cursor-pointer hover:border-white/[0.15]"
            style={{ colorScheme: "dark" }}
          >
            <option value="marketcap">Sort: Market cap</option>
            <option value="price">Sort: Price</option>
            <option value="name">Sort: Name</option>
          </select>
          <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[#555] pointer-events-none text-xs">▾</span>
        </div>
      </div>

      {/* Table */}
      <div className="card overflow-hidden">
        {/* Header */}
        <div className="flex items-center px-6 py-3 border-b border-white/[0.06] text-[11px] text-[#555] uppercase tracking-wider font-medium">
          <div className="flex-1">Country</div>
          <div className="w-36 text-right">Price</div>
          <div className="w-36 text-right hidden md:block">Market Cap</div>
          <div className="w-32 text-right hidden lg:block">Liquidity</div>
          <div className="w-20 text-right">Trade</div>
        </div>

        {/* Rows */}
        {filtered.map((country) => (
          <div
            key={country.id}
            className="flex items-center px-6 py-4 border-b border-white/[0.03] hover:bg-white/[0.02] transition-colors"
          >
            {/* Country */}
            <div className="flex-1 flex items-center gap-3">
              <img
                src={getFlagUrl(country.symbol)}
                alt={country.name}
                className="w-8 h-6 rounded object-cover"
              />
              <div>
                <p className="text-sm font-medium">{country.name}</p>
                <p className="text-[11px] text-[#555]">{country.symbol}</p>
              </div>
            </div>

            {/* Price */}
            <div className="w-36 text-right">
              <p className="text-sm font-mono">{country.price > 0 ? country.price.toFixed(4) : "—"} <span className="text-[#555] text-xs">FANOVO</span></p>
            </div>

            {/* Market Cap */}
            <div className="w-36 text-right hidden md:block">
              <p className="text-sm font-mono">{country.marketCap > 0 ? formatNum(country.marketCap) : "—"} <span className="text-[#555] text-xs">FANOVO</span></p>
            </div>

            {/* Liquidity */}
            <div className="w-32 text-right hidden lg:block">
              <p className="text-sm font-mono">{country.tvl > 0 ? formatNum(country.tvl) : "—"} <span className="text-[#555] text-xs">FANOVO</span></p>
            </div>

            {/* Trade */}
            <div className="w-20 text-right">
              <span className="text-xs text-[#555]">Phase 2</span>
            </div>
          </div>
        ))}
      </div>
      </>)}
    </div>
  );
}

function formatNum(n: number): string {
  if (n >= 1000) return (n / 1000).toFixed(1) + "K";
  if (n >= 1) return n.toFixed(0);
  return n.toFixed(3);
}


