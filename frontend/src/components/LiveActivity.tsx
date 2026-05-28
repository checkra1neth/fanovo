"use client";

import { useMemo, useState } from "react";
import { formatEther } from "viem";
import { shortAddress } from "@/lib/contracts";
import { explorerAddressUrl } from "@/lib/wagmi";
import type { ActivityRow } from "@/lib/useFanovoActivity";

type Filter = "all" | "burns" | "players" | "packs";

export type CountryMeta = { symbol: string; name: string; flag: string; id: number };
export type PlayerMeta = {
  name: string;
  symbol: string;
  role: 0 | 1 | 2;
  countryId: number;
  countrySymbol: string;
  countryFlag: string;
};

export function LiveActivity({
  rows,
  loading,
  error,
  countryByToken,
  playerByToken,
}: {
  rows: ActivityRow[];
  loading: boolean;
  error: string | null;
  countryByToken: Map<string, CountryMeta>;
  playerByToken?: Map<string, PlayerMeta>;
}) {
  const [filter, setFilter] = useState<Filter>("all");

  const counts = useMemo(() => {
    const burns = rows.filter((r) => r.kind === "buy" || r.kind === "sell").length;
    const players = rows.filter((r) => r.kind === "playerBuy" || r.kind === "playerSell").length;
    const packs = rows.filter((r) => r.kind === "pack" || r.kind === "playerPack").length;
    return { all: rows.length, burns, players, packs };
  }, [rows]);

  const visible = useMemo(() => {
    const filtered =
      filter === "burns"
        ? rows.filter((r) => r.kind === "buy" || r.kind === "sell")
        : filter === "players"
        ? rows.filter((r) => r.kind === "playerBuy" || r.kind === "playerSell")
        : filter === "packs"
        ? rows.filter((r) => r.kind === "pack" || r.kind === "playerPack")
        : rows;
    return filtered.slice(0, 50);
  }, [rows, filter]);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-[10px] text-[#555] uppercase tracking-widest">Live Activity</p>
        <div className="flex gap-2 flex-wrap">
          <FilterPill active={filter === "all"} count={counts.all} onClick={() => setFilter("all")}>
            All
          </FilterPill>
          <FilterPill
            active={filter === "burns"}
            count={counts.burns}
            tone="rose"
            onClick={() => setFilter("burns")}
          >
            Country burns
          </FilterPill>
          <FilterPill
            active={filter === "players"}
            count={counts.players}
            tone="emerald"
            onClick={() => setFilter("players")}
          >
            Player trades
          </FilterPill>
          <FilterPill
            active={filter === "packs"}
            count={counts.packs}
            tone="amber"
            onClick={() => setFilter("packs")}
          >
            Pack reveals
          </FilterPill>
        </div>
      </div>

      <div className="card p-0 overflow-hidden">
        {loading && (
          <p className="text-center text-sm text-[#555] py-10">Scanning recent blocks…</p>
        )}

        {!loading && error && (
          <p className="text-center text-sm text-[#ff2d55] py-10">{error}</p>
        )}

        {!loading && !error && visible.length === 0 && (
          <p className="text-center text-sm text-[#555] py-10">
            No on-chain activity in the lookback window.
          </p>
        )}

        {!loading && !error && visible.length > 0 && (
          <div className="divide-y divide-white/[0.05]">
            <div className="grid grid-cols-[1fr_auto_auto] gap-4 px-4 py-2 text-[10px] uppercase tracking-wider text-[#555]">
              <span>Market</span>
              <span className="text-right">User</span>
              <span className="text-right">Burnt / Traded</span>
            </div>
            {visible.map((r) => {
              const tokenKey = r.asset?.toLowerCase();
              const isPlayer =
                r.kind === "playerBuy" || r.kind === "playerSell" || r.kind === "playerPack";
              const player = isPlayer && tokenKey ? playerByToken?.get(tokenKey) : undefined;
              const country =
                !isPlayer && tokenKey ? countryByToken.get(tokenKey) : undefined;
              return <ActivityRowView key={r.key} row={r} country={country} player={player} />;
            })}
          </div>
        )}
      </div>
    </div>
  );
}

function ActivityRowView({
  row,
  country,
  player,
}: {
  row: ActivityRow;
  country: CountryMeta | undefined;
  player: PlayerMeta | undefined;
}) {
  const isBuy = row.kind === "buy";
  const isSell = row.kind === "sell";
  const isPack = row.kind === "pack";
  const isPBuy = row.kind === "playerBuy";
  const isPSell = row.kind === "playerSell";
  const isPPack = row.kind === "playerPack";

  const barColor =
    isBuy || isPBuy
      ? "bg-[#34d399]"
      : isSell || isPSell
      ? "bg-[#ff2d55]"
      : "bg-[#f59e0b]";

  const label = player ? player.name : country?.name ?? "Unknown";
  const symbol = player ? player.symbol : country?.symbol ?? "";
  const flag = player ? player.countryFlag : country?.flag ?? "🌐";
  const counterSymbol = player ? player.countrySymbol : "FANOVO";

  return (
    <div className="grid grid-cols-[1fr_auto_auto] gap-4 px-4 py-3 items-center text-sm">
      <div className="flex items-center gap-3">
        <div className={`w-1 h-8 rounded-full ${barColor}`} />
        <span className="text-lg leading-none">{flag}</span>
        <div className="leading-tight">
          <p className="font-semibold">
            {label}{" "}
            <span className="text-[10px] text-[#555] font-mono">{symbol}</span>
          </p>
          <p className="text-[11px] uppercase tracking-wider">
            {isBuy && <span className="text-[#34d399]">BUY</span>}
            {isSell && <span className="text-[#ff2d55]">SELL</span>}
            {isPack && <span className="text-[#f59e0b]">PACK REVEAL</span>}
            {isPBuy && <span className="text-[#34d399]">PLAYER BUY</span>}
            {isPSell && <span className="text-[#ff2d55]">PLAYER SELL</span>}
            {isPPack && <span className="text-[#f59e0b]">PLAYER PACK</span>}
          </p>
        </div>
      </div>

      <div className="text-right">
        <a
          href={explorerAddressUrl(row.user)}
          target="_blank"
          rel="noreferrer"
          className="font-mono text-[11px] text-[#888] hover:text-white"
        >
          {shortAddress(row.user, 4, 4)}
        </a>
      </div>

      <div className="text-right font-mono text-xs leading-tight">
        {isBuy && (
          <>
            <p className="text-[#34d399]">
              {fmt(row.fanovoIn)} <span className="text-[#555]">FANOVO</span>
            </p>
            <p className="text-[#555]">
              → {fmt(row.countryAmount)} {symbol}
            </p>
            {row.burned !== undefined && row.burned > 0n && (
              <p className="text-[10px] text-[#ff2d55]">burns {fmt(row.burned)}</p>
            )}
          </>
        )}
        {isSell && (
          <>
            <p className="text-[#ff2d55]">
              {fmt(row.countryAmount)} <span className="text-[#555]">{symbol}</span>
            </p>
            <p className="text-[#555]">→ {fmt(row.fanovoOut)} FANOVO</p>
            {row.burned !== undefined && row.burned > 0n && (
              <p className="text-[10px] text-[#ff2d55]">burns {fmt(row.burned)}</p>
            )}
          </>
        )}
        {isPack && (
          <p className="text-[#f59e0b]">
            +1 pack <span className="text-[#555]">{symbol}</span>
          </p>
        )}
        {isPBuy && (
          <>
            <p className="text-[#34d399]">
              {fmt(row.countryAmount)} <span className="text-[#555]">{counterSymbol}</span>
            </p>
            <p className="text-[#555]">
              → {fmt(row.playerAmount)} {symbol}
            </p>
            {row.burned !== undefined && row.burned > 0n && (
              <p className="text-[10px] text-[#ff2d55]">burns {fmt(row.burned)}</p>
            )}
          </>
        )}
        {isPSell && (
          <>
            <p className="text-[#ff2d55]">
              {fmt(row.playerAmount)} <span className="text-[#555]">{symbol}</span>
            </p>
            <p className="text-[#555]">
              → {fmt(row.countryAmount)} {counterSymbol}
            </p>
            {row.burned !== undefined && row.burned > 0n && (
              <p className="text-[10px] text-[#ff2d55]">burns {fmt(row.burned)}</p>
            )}
          </>
        )}
        {isPPack && (
          <p className="text-[#f59e0b]">
            +1 pack <span className="text-[#555]">{symbol}</span>
          </p>
        )}
      </div>
    </div>
  );
}

function FilterPill({
  active,
  count,
  tone = "default",
  onClick,
  children,
}: {
  active: boolean;
  count: number;
  tone?: "default" | "rose" | "emerald" | "amber";
  onClick: () => void;
  children: React.ReactNode;
}) {
  const base =
    "text-[10px] rounded px-2 py-1 border flex items-center gap-1.5 transition-colors";
  let styles: string;
  if (active) {
    if (tone === "rose") styles = "bg-[#ff2d55]/15 border-[#ff2d55]/40 text-[#ff2d55]";
    else if (tone === "emerald") styles = "bg-[#34d399]/15 border-[#34d399]/40 text-[#34d399]";
    else if (tone === "amber") styles = "bg-[#f59e0b]/15 border-[#f59e0b]/40 text-[#f59e0b]";
    else styles = "bg-white/[0.06] border-white/[0.16] text-white";
  } else {
    styles = "bg-[#161616] border-white/[0.08] text-[#888] hover:text-white";
  }

  return (
    <button onClick={onClick} className={`${base} ${styles}`} type="button">
      {children}
      <span className="font-mono text-[9px] opacity-80">{count}</span>
    </button>
  );
}

function fmt(v?: bigint): string {
  if (v === undefined) return "—";
  const n = Number(formatEther(v));
  if (n >= 1000) return n.toFixed(0);
  if (n >= 1) return n.toFixed(3);
  if (n >= 0.0001) return n.toFixed(4);
  return n.toExponential(2);
}
