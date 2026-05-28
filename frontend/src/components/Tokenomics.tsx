"use client";

import { useEffect, useMemo, useState } from "react";
import { useReadContract } from "wagmi";
import { formatEther } from "viem";
import { CONTRACTS, COUNTRIES, PLAYERS } from "@/lib/contracts";
import {
  packOpenerAbi,
  fanovoTokenAbi,
  worldCupHookAbi,
  fanovoSaleAbi,
} from "@/lib/abi";
import { LiveActivity, type PlayerMeta } from "@/components/LiveActivity";
import { useFanovoActivity } from "@/lib/useFanovoActivity";
import {
  useCountryTokens,
  useCountryCurves,
  usePlayerTokens,
  usePlayerReserves,
  usePlayerPacksByCountry,
} from "@/lib/useFanovoData";

interface ApiSummary {
  totalBurnedWei: string;
  burnedLast24hWei: string;
  burnEventsLast24h: number;
  volumeLast24hWei: string;
  packBurns24hWei: string;
  playerPackBurns24hWei: string;
  countrySwaps24h: number;
  playerTrades24h: number;
  scannedFromBlock: string;
  scannedToBlock: string;
  scannedAt: number;
}

export function Tokenomics() {
  // -------- API summary (server-indexed) --------
  const [apiSummary, setApiSummary] = useState<ApiSummary | null>(null);
  const [apiLoading, setApiLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const res = await fetch("/api/tokenomics");
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = (await res.json()) as ApiSummary;
        if (!cancelled) setApiSummary(data);
      } catch (err) {
        console.error("[Tokenomics] API fetch failed:", err);
      } finally {
        if (!cancelled) setApiLoading(false);
      }
    }
    load();
    const id = setInterval(load, 30_000);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, []);

  // -------- Token state --------
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

  // -------- Sale price (PRICE_USD has 6 decimals — USDT-style) --------
  const { data: priceUsdRaw } = useReadContract({
    address: CONTRACTS.fanovoSale,
    abi: fanovoSaleAbi,
    functionName: "PRICE_USD",
  });

  // -------- Pack opener stats --------
  const { data: packsOpened } = useReadContract({
    address: CONTRACTS.packOpener,
    abi: packOpenerAbi,
    functionName: "totalPacksOpened",
  });

  // -------- Country curves (shared cache via useFanovoData) --------
  const { addresses: countryAddrs } = useCountryTokens();
  const { states: curveStates } = useCountryCurves(countryAddrs);

  // -------- Player curves (shared cache) --------
  const { addresses: playerAddrs } = usePlayerTokens();
  const { reserves: playerReserves } = usePlayerReserves(playerAddrs);
  const { counts: playerPackCounts } = usePlayerPacksByCountry();

  // -------- Fees --------
  const { data: swapFeeBps } = useReadContract({
    address: CONTRACTS.worldCupHook,
    abi: worldCupHookAbi,
    functionName: "SWAP_FEE_BPS",
  });

  // -------- On-chain activity scan (events) --------
  const { rows, metrics, loading: activityLoading, error: activityError } =
    useFanovoActivity();

  // -------- Derived numbers --------
  const max = maxSupply ? Number(formatEther(maxSupply as bigint)) : 0;
  const supply = totalSupply ? Number(formatEther(totalSupply as bigint)) : 0;
  const burned = max > 0 ? max - supply : 0;
  const packs = packsOpened ? Number(packsOpened) : 0;
  const feeBps = swapFeeBps ? Number(swapFeeBps) : 0;

  // PRICE_USD is USDT 6-decimals (1 FANOVO = priceUsd / 1e6 USDT).
  const priceUsd = priceUsdRaw ? Number(priceUsdRaw as bigint) / 1e6 : 0;

  const countryTvl = curveStates.reduce((sum, s) => {
    if (!s) return sum;
    const [realFanovo] = s;
    return sum + Number(formatEther(realFanovo));
  }, 0);
  const initializedCurves = curveStates.filter((s) => s && s[2]).length;

  // Player TVL is sum of realCountry across all player reserves (denominated
  // in country tokens, which are 1:1 with country curve seeds — we report it
  // as "FANOVO-equivalent" since each country token is created by burning FANOVO).
  const playerTvlFanovo = playerReserves.reduce((sum, r) => {
    if (!r) return sum;
    const [realCountry] = r;
    return sum + Number(formatEther(realCountry));
  }, 0);
  const initializedPlayerCurves = playerReserves.filter((r) => {
    if (!r) return false;
    const [realCountry, circulating] = r;
    return realCountry > 0n || circulating > 0n;
  }).length;

  const totalPlayerPacks = playerPackCounts.reduce((s, n) => s + n, 0);

  // 24h numbers — prefer API, fallback to client scan
  const apiBurned24h = apiSummary ? Number(formatEther(BigInt(apiSummary.burnedLast24hWei))) : 0;
  const apiVolume24h = apiSummary ? Number(formatEther(BigInt(apiSummary.volumeLast24hWei))) : 0;
  const apiPackBurns24h = apiSummary ? Number(formatEther(BigInt(apiSummary.packBurns24hWei))) : 0;
  const apiPlayerPackBurns24h = apiSummary ? Number(formatEther(BigInt(apiSummary.playerPackBurns24hWei))) : 0;
  const apiCountrySwaps24h = apiSummary?.countrySwaps24h ?? 0;
  const apiPlayerTrades24h = apiSummary?.playerTrades24h ?? 0;

  const burned24h = apiBurned24h > 0 ? apiBurned24h : Number(formatEther(metrics.burnedLast24h));
  const countryVol24h = apiVolume24h > 0 ? apiVolume24h : Number(formatEther(metrics.countryVolume24h));
  const countryTokensBurned24h = Number(formatEther(metrics.countryTokensBurned24h));
  const playerTokensBurned24h = Number(formatEther(metrics.playerTokensBurned24h));
  const packBurns24h = apiPackBurns24h > 0 ? apiPackBurns24h : Number(formatEther(metrics.packBurns24h));
  const playerPackBurns24h = apiPlayerPackBurns24h > 0 ? apiPlayerPackBurns24h : Number(formatEther(metrics.playerPackBurns24h));

  // Market cap = circulating supply * spot USD price.
  const marketCapUsd = supply > 0 && priceUsd > 0 ? supply * priceUsd : 0;

  // Total protocol TVL split (country vs player).
  const totalTvl = countryTvl + playerTvlFanovo;
  const countryShare = totalTvl > 0 ? (countryTvl / totalTvl) * 100 : 0;
  const playerShare = totalTvl > 0 ? (playerTvlFanovo / totalTvl) * 100 : 0;

  // -------- Maps for LiveActivity --------
  const countryByToken = useMemo(() => {
    const m = new Map<
      string,
      { symbol: string; name: string; flag: string; id: number }
    >();
    countryAddrs.forEach((addr, i) => {
      const country = COUNTRIES[i];
      if (!addr || !country) return;
      m.set(addr.toLowerCase(), {
        symbol: country.symbol,
        name: country.name,
        flag: country.flag,
        id: country.id,
      });
    });
    return m;
  }, [countryAddrs]);

  const playerByToken = useMemo(() => {
    const m = new Map<string, PlayerMeta>();
    playerAddrs.forEach((addr, i) => {
      const player = PLAYERS[i];
      if (!addr || !player) return;
      const country = COUNTRIES[player.countryId];
      m.set(addr.toLowerCase(), {
        name: player.name,
        symbol: player.symbol,
        role: player.role,
        countryId: player.countryId,
        countrySymbol: country?.symbol ?? "",
        countryFlag: country?.flag ?? "🌐",
      });
    });
    return m;
  }, [playerAddrs]);

  // -------- Render --------
  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <p className="text-[10px] text-[#ff2d55] uppercase tracking-widest font-semibold mb-1">
            Protocol Health
          </p>
          <h1 className="text-3xl font-bold">Tokenomics</h1>
          <p className="text-sm text-[#888] mt-1">
            Live protocol health for FANOVO. Every country-curve swap burns a fee in FANOVO.
            Every pack open burns a portion on the spot.
          </p>
        </div>
      </div>

      {/* Row 1 — supply burn */}
      <div className="grid grid-cols-3 gap-4">
        <Card accent>
          <CardHeader label="Total FANOVO Burnt" badge="ON BURN" />
          <Big value={burned > 0 ? formatK(burned) : "—"} unit="FANOVO" />
          <CardSub>
            {max > 0 ? `${formatK(max)} max` : "—"} − supply{" "}
            {supply > 0 ? formatK(supply) : "—"}
            {supply > 0 && priceUsd > 0 && burned > 0 && (
              <> − {usd(burned * priceUsd)}</>
            )}
          </CardSub>
        </Card>

        <Card>
          <CardHeader label="Burnt last 24h" />
          <Big value={burned24h > 0 ? formatK(burned24h) : "—"} unit="FANOVO" />
          <CardSub>
            {apiCountrySwaps24h > 0 || metrics.countrySwaps24h > 0
              ? `${apiCountrySwaps24h || metrics.countrySwaps24h} swaps`
              : ""}
            {packBurns24h > 0 && (
              <>{apiCountrySwaps24h > 0 || metrics.countrySwaps24h > 0 ? " • " : ""}packs ~{formatK(packBurns24h)} FANOVO</>
            )}
            {!(apiCountrySwaps24h > 0 || metrics.countrySwaps24h > 0 || packBurns24h > 0) && "—"}
          </CardSub>
        </Card>

        <Card>
          <CardHeader label="FANOVO Market Cap" />
          <Big
            value={marketCapUsd > 0 ? usd(marketCapUsd) : "—"}
            unit=""
            mono
          />
          <CardSub>
            {priceUsd > 0
              ? `1 FANOVO = ${priceUsd.toFixed(4)} USDT`
              : "price loading…"}
          </CardSub>
        </Card>
      </div>

      {/* Row 2 — TVL split & volume */}
      <div className="grid grid-cols-3 gap-4">
        <Card>
          <CardHeader label="Country TVL" />
          <Big
            value={countryTvl > 0 ? formatK(countryTvl) : "—"}
            unit="FANOVO"
          />
          <CardSub>
            {priceUsd > 0 && countryTvl > 0 && (
              <>{usd(countryTvl * priceUsd)} • </>
            )}
            {initializedCurves > 0
              ? `${initializedCurves} of 48 curves`
              : "—"}
          </CardSub>
        </Card>

        <Card>
          <CardHeader label="Player TVL" />
          <Big
            value={playerTvlFanovo > 0 ? formatK(playerTvlFanovo) : "—"}
            unit="FANOVO eq."
          />
          <CardSub>
            {priceUsd > 0 && playerTvlFanovo > 0 && (
              <>{usd(playerTvlFanovo * priceUsd)} • </>
            )}
            {initializedPlayerCurves > 0
              ? `${initializedPlayerCurves} of 144 player curves`
              : "Phase 1 — no player trading yet"}
          </CardSub>
        </Card>

        <Card>
          <CardHeader label="24h Country Volume" />
          <Big
            value={countryVol24h > 0 ? formatK(countryVol24h) : "—"}
            unit="FANOVO"
          />
          <CardSub>
            {priceUsd > 0 && countryVol24h > 0 && <>{usd(countryVol24h * priceUsd)}</>}
            {!(priceUsd > 0 && countryVol24h > 0) && "—"}
          </CardSub>
        </Card>
      </div>

      {/* Row 3 — player activity & token burns */}
      <div className="grid grid-cols-3 gap-4">
        <Card>
          <CardHeader label="Player Trades 24h" />
          <Big value={metrics.playerTrades24h > 0 ? metrics.playerTrades24h.toString() : "—"} unit="swaps" />
          <CardSub>
            {metrics.playerTrades > 0
              ? `${metrics.playerTrades.toLocaleString()} all-time`
              : "—"}
          </CardSub>
        </Card>

        <Card>
          <CardHeader label="Country tokens burnt 24h" />
          <Big
            value={
              metrics.playerBuyCount24h > 0
                ? metrics.playerBuyCount24h.toString()
                : "—"
            }
            unit="player buys"
          />
          <CardSub>
            {countryTokensBurned24h > 0
              ? `~${formatK(countryTokensBurned24h)} country tokens burned`
              : "—"}
          </CardSub>
        </Card>

        <Card>
          <CardHeader label="Player tokens burnt 24h" />
          <Big
            value={
              metrics.playerSellCount24h > 0
                ? metrics.playerSellCount24h.toString()
                : "—"
            }
            unit="player sells"
          />
          <CardSub>
            {playerTokensBurned24h > 0
              ? `~${formatK(playerTokensBurned24h)} player tokens burned`
              : `across ${initializedPlayerCurves} player curves`}
          </CardSub>
        </Card>
      </div>

      {/* Row 4 — pack stats & swap fee */}
      <div className="grid grid-cols-3 gap-4">
        <Card>
          <CardHeader label="Country Packs Opened" />
          <Big value={packs > 0 ? packs.toLocaleString() : "—"} unit="packs" />
          <CardSub>
            {feeBps > 0 && packs > 0
              ? `~${formatK(packs * (feeBps / 10000))} FANOVO burned from packs`
              : "—"}
          </CardSub>
        </Card>

        <Card>
          <CardHeader label="Player Packs Opened" />
          <Big
            value={totalPlayerPacks > 0 ? totalPlayerPacks.toLocaleString() : "—"}
            unit="packs"
          />
          <CardSub>across 48 countries</CardSub>
        </Card>

        <Card>
          <CardHeader label="Swap Fee" />
          <Big
            value={feeBps > 0 ? (feeBps / 100).toFixed(2) : "—"}
            unit="%"
            mono
          />
          <CardSub>burned on every swap</CardSub>
        </Card>
      </div>

      {/* Total Protocol TVL */}
      <div className="card p-6">
        <div className="flex items-center justify-between flex-wrap gap-4">
          <div>
            <p className="text-[10px] text-[#555] uppercase tracking-wider mb-2">
              Total Protocol TVL
            </p>
            <p className="text-2xl font-bold font-mono">
              {totalTvl > 0 ? formatK(totalTvl) : "—"}{" "}
              <span className="text-sm text-[#555]">FANOVO</span>
            </p>
            <p className="text-xs text-[#555] mt-1">
              {priceUsd > 0 && totalTvl > 0 && <>{usd(totalTvl * priceUsd)} • </>}
              country {countryTvl > 0 ? formatK(countryTvl) : "—"} + player{" "}
              {playerTvlFanovo > 0 ? formatK(playerTvlFanovo) : "—"}
            </p>
          </div>
          <div className="flex items-center gap-4 text-xs">
            <div className="flex items-center gap-1.5">
              <div className="w-8 h-1 bg-[#ff2d55] rounded-full" />
              <span className="text-[#888]">
                COUNTRY {countryShare > 0 ? `${countryShare.toFixed(0)}%` : ""}
              </span>
            </div>
            <div className="flex items-center gap-1.5">
              <div className="w-8 h-1 bg-[#34d399] rounded-full" />
              <span className="text-[#888]">
                PLAYER {playerShare > 0 ? `${playerShare.toFixed(0)}%` : ""}
              </span>
            </div>
          </div>
        </div>
        <div className="mt-4 h-2 bg-[#161616] rounded-full overflow-hidden flex">
          <div
            className="h-full bg-[#ff2d55]"
            style={{ width: `${countryShare || 0}%` }}
          />
          <div
            className="h-full bg-[#34d399]"
            style={{ width: `${playerShare || 0}%` }}
          />
        </div>
      </div>

      {/* Live Activity */}
      <LiveActivity
        rows={rows}
        loading={activityLoading}
        error={activityError}
        countryByToken={countryByToken}
        playerByToken={playerByToken}
      />
    </div>
  );
}

// ---------- Tiny presentational helpers ----------

function Card({ children, accent }: { children: React.ReactNode; accent?: boolean }) {
  return (
    <div className={`card p-5 ${accent ? "border-t-2 border-t-[#ff2d55]" : ""}`}>
      {children}
    </div>
  );
}

function CardHeader({ label, badge }: { label: string; badge?: string }) {
  return (
    <div className="flex items-center gap-2 mb-2">
      <p className="text-[10px] text-[#555] uppercase tracking-wider">{label}</p>
      {badge && (
        <span className="text-[9px] bg-[#ff2d55]/10 text-[#ff2d55] px-1.5 py-0.5 rounded font-semibold">
          {badge}
        </span>
      )}
    </div>
  );
}

function Big({
  value,
  unit,
  mono = false,
}: {
  value: string;
  unit?: string;
  mono?: boolean;
}) {
  return (
    <p className={`text-2xl font-bold ${mono ? "font-mono" : "font-mono"}`}>
      {value}
      {unit && <span className="text-sm text-[#555] ml-1">{unit}</span>}
    </p>
  );
}

function CardSub({ children }: { children: React.ReactNode }) {
  return <p className="text-xs text-[#555] mt-1">{children}</p>;
}

function formatK(n: number): string {
  if (!Number.isFinite(n)) return "—";
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(2) + "M";
  if (n >= 1_000) return (n / 1_000).toFixed(1) + "K";
  if (n >= 1) return n.toFixed(2);
  if (n >= 0.0001) return n.toFixed(4);
  return n.toExponential(2);
}

function usd(n: number): string {
  if (!Number.isFinite(n) || n <= 0) return "—";
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(2)}M`;
  if (n >= 1_000) return `$${(n / 1_000).toFixed(1)}K`;
  if (n >= 1) return `$${n.toFixed(2)}`;
  return `$${n.toFixed(4)}`;
}
