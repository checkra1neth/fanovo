"use client";

import { useEffect, useMemo, useRef, useState, useCallback } from "react";
import { usePublicClient } from "wagmi";
import { deserialize, serialize } from "wagmi";
import type { Address, Log, PublicClient } from "viem";
import { CONTRACTS } from "@/lib/contracts";
import {
  worldCupHookAbi,
  packOpenerAbi,
  playerHookAbi,
  playerPackOpenerAbi,
} from "@/lib/abi";

export type ActivityKind =
  | "buy"
  | "sell"
  | "pack"
  | "playerBuy"
  | "playerSell"
  | "playerPack";

export type ActivityRow = {
  key: string;
  block: bigint;
  txHash: `0x${string}`;
  kind: ActivityKind;
  user: Address;
  asset?: Address;
  fanovoIn?: bigint;
  fanovoOut?: bigint;
  countryAmount?: bigint;
  playerAmount?: bigint;
  burned?: bigint;
  timestamp?: number;
};

export type FanovoMetrics = {
  total: number;
  countryBurns: number;
  playerTrades: number;
  packReveals: number;
  burnedLast24h: bigint;
  countrySwaps24h: number;
  countryVolume24h: bigint;
  playerTrades24h: number;
  countryTokensBurned24h: bigint;
  playerTokensBurned24h: bigint;
  playerBuyCount24h: number;
  playerSellCount24h: number;
  packBurns24h: bigint;
  playerPackBurns24h: bigint;
};

// X Layer ~3s blocks. 28800 blocks ≈ 24h.
const BLOCKS_PER_DAY = 28_800n;
// X Layer RPC caps eth_getLogs at 100 blocks per call. Chunk slightly under.
const CHUNK = 95n;
// Initial scan window. ~60 min of history for first paint.
const INITIAL_LOOKBACK = 1_200n;
// Keep at most this many rows in memory (and prune anything older than 2d).
const MAX_ROWS = 500;
const PRUNE_OLDER_THAN = BLOCKS_PER_DAY * 2n;
const POLL_MS = 12_000;

// localStorage key + version. Bump version to invalidate persisted cache
// (e.g. on contract redeploy).
const STORAGE_KEY = "fanovo-activity-v2";
const STORAGE_MAX_AGE_MS = 24 * 60 * 60 * 1000;

// Burn amounts per pack (hardcoded from contract constants)
const PACK_BURN_FANOVO = 5n * 10n ** 16n; // 0.05 FANOVO per country pack
const PACK_BURN_COUNTRY = 5n * 10n ** 16n; // 0.05 country token per player pack

type PersistedShape = {
  ts: number;
  lastScanned: bigint;
  rows: ActivityRow[];
};

function loadPersisted(): PersistedShape | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = deserialize(raw) as PersistedShape;
    if (
      !parsed ||
      typeof parsed !== "object" ||
      typeof parsed.ts !== "number" ||
      !Array.isArray(parsed.rows)
    ) {
      return null;
    }
    if (Date.now() - parsed.ts > STORAGE_MAX_AGE_MS) return null;
    return parsed;
  } catch {
    return null;
  }
}

function savePersisted(rows: ActivityRow[], lastScanned: bigint) {
  if (typeof window === "undefined") return;
  try {
    const payload: PersistedShape = { ts: Date.now(), lastScanned, rows };
    window.localStorage.setItem(STORAGE_KEY, serialize(payload));
  } catch {
    // quota exceeded or storage disabled — silently ignore
  }
}

type EventDef = { address: `0x${string}`; event: unknown; kind: ActivityKind };

function buildEventDefs(): EventDef[] {
  const findEvent = (abi: readonly unknown[], name: string) =>
    abi.find(
      (i): i is { type: "event"; name: string } =>
        typeof i === "object" &&
        i !== null &&
        (i as { type?: string }).type === "event" &&
        (i as { name?: string }).name === name
    );

  return [
    { address: CONTRACTS.worldCupHook, event: findEvent(worldCupHookAbi, "Buy"), kind: "buy" },
    { address: CONTRACTS.worldCupHook, event: findEvent(worldCupHookAbi, "Sell"), kind: "sell" },
    { address: CONTRACTS.worldCupHook, event: findEvent(worldCupHookAbi, "PackMinted"), kind: "pack" },
    { address: CONTRACTS.packOpener, event: findEvent(packOpenerAbi, "PackRevealed"), kind: "pack" },
    { address: CONTRACTS.playerHook, event: findEvent(playerHookAbi, "Buy"), kind: "playerBuy" },
    { address: CONTRACTS.playerHook, event: findEvent(playerHookAbi, "Sell"), kind: "playerSell" },
    { address: CONTRACTS.playerHook, event: findEvent(playerHookAbi, "PackMinted"), kind: "playerPack" },
    { address: CONTRACTS.playerPackOpener, event: findEvent(playerPackOpenerAbi, "PlayerPackRevealed"), kind: "playerPack" },
  ];
}

async function fetchLogsChunked(
  client: PublicClient,
  def: EventDef,
  from: bigint,
  to: bigint
): Promise<DecodedLog[]> {
  const out: DecodedLog[] = [];
  let cursor = from;
  while (cursor <= to) {
    const end = cursor + CHUNK - 1n > to ? to : cursor + CHUNK - 1n;
    try {
      const logs = await client.getLogs({
        address: def.address,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        event: def.event as any,
        fromBlock: cursor,
        toBlock: end,
      });
      out.push(...(logs as unknown as DecodedLog[]));
    } catch (err) {
      console.error(`[useFanovoActivity] getLogs error ${def.kind} ${cursor}-${end}:`, err);
    }
    cursor = end + 1n;
  }
  return out;
}

function rowFromLog(kind: ActivityKind, l: DecodedLog): ActivityRow {
  const a = l.args as Record<string, unknown>;
  const base = {
    key: `${l.transactionHash}-${l.logIndex}`,
    block: l.blockNumber,
    txHash: l.transactionHash,
    kind,
    user: a.user as Address,
  };

  if (kind === "buy") {
    return {
      ...base,
      asset: a.country as Address,
      fanovoIn: a.fanovoIn as bigint,
      countryAmount: a.countryOut as bigint,
      burned: a.burned as bigint,
    };
  }
  if (kind === "sell") {
    return {
      ...base,
      asset: a.country as Address,
      fanovoOut: a.fanovoOut as bigint,
      countryAmount: a.countryIn as bigint,
      burned: a.burned as bigint,
    };
  }
  if (kind === "pack") {
    // PackMinted from WorldCupHook has no user in args — user is from PackRevealed
    const addr = (a.country ?? a.player ?? "0x0") as Address;
    return {
      ...base,
      asset: addr,
      burned: kind === "pack" && l.eventName === "PackMinted" ? PACK_BURN_FANOVO : undefined,
    };
  }
  if (kind === "playerBuy") {
    return {
      ...base,
      asset: a.player as Address,
      countryAmount: a.countryIn as bigint,
      playerAmount: a.playerOut as bigint,
      burned: a.burned as bigint,
    };
  }
  if (kind === "playerSell") {
    return {
      ...base,
      asset: a.player as Address,
      playerAmount: a.playerIn as bigint,
      countryAmount: a.countryOut as bigint,
      burned: a.burned as bigint,
    };
  }
  // playerPack
  const addr = (a.player ?? "0x0") as Address;
  return {
    ...base,
    asset: addr,
    burned: l.eventName === "PackMinted" ? PACK_BURN_COUNTRY : undefined,
  };
}

export function useFanovoActivity() {
  const client = usePublicClient();

  // Hydrate from localStorage synchronously so the UI paints with cached data.
  const initial = useMemo(() => loadPersisted(), []);

  const [rows, setRows] = useState<ActivityRow[]>(() => initial?.rows ?? []);
  const [head, setHead] = useState<bigint | null>(null);
  const [loading, setLoading] = useState(() => !initial);
  const [error, setError] = useState<string | null>(null);

  // Last block we scanned up to (inclusive). Used to do incremental polls.
  const lastScannedRef = useRef<bigint | null>(initial?.lastScanned ?? null);
  // Dedup keys, so reruns don't double-insert the same log.
  const seenRef = useRef<Set<string>>(
    new Set(initial?.rows.map((r) => r.key) ?? [])
  );

  useEffect(() => {
    if (!client) return;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;

    const defs = buildEventDefs();

    async function pull() {
      try {
        const tip = await client!.getBlockNumber();

        let from: bigint;
        if (lastScannedRef.current === null) {
          from = tip > INITIAL_LOOKBACK ? tip - INITIAL_LOOKBACK : 0n;
        } else if (lastScannedRef.current >= tip) {
          // Nothing new — still update head and exit early.
          if (!cancelled) {
            setHead(tip);
            setLoading(false);
          }
          return;
        } else {
          from = lastScannedRef.current + 1n;
        }

        // Fetch all event defs in parallel for speed
        const allLogs = await Promise.all(
          defs
            .filter((d) => d.event)
            .map((def) => fetchLogsChunked(client!, def, from, tip))
        );
        const newRows: ActivityRow[] = [];
        for (let i = 0; i < defs.length; i++) {
          if (cancelled) return;
          const def = defs[i];
          if (!def.event) continue;
          const logs = allLogs[i];
          for (const l of logs) {
            const row = rowFromLog(def.kind, l);
            if (seenRef.current.has(row.key)) continue;
            seenRef.current.add(row.key);
            newRows.push(row);
          }
        }

        lastScannedRef.current = tip;

        if (!cancelled) {
          setRows((prev) => {
            // prune anything older than 2 days from the new tip
            const cutoff = tip > PRUNE_OLDER_THAN ? tip - PRUNE_OLDER_THAN : 0n;
            const merged = [...prev, ...newRows].filter((r) => r.block >= cutoff);
            merged.sort((a, b) =>
              a.block > b.block ? -1 : a.block < b.block ? 1 : 0
            );
            if (merged.length > MAX_ROWS) merged.length = MAX_ROWS;
            // also prune the dedup set so it doesn't grow unboundedly
            if (seenRef.current.size > MAX_ROWS * 2) {
              const next = new Set<string>();
              for (const r of merged) next.add(r.key);
              seenRef.current = next;
            }
            // Persist after every successful scan so the next reload paints
            // instantly without waiting for the network round-trip.
            savePersisted(merged, tip);
            return merged;
          });
          setHead(tip);
          setError(null);
          setLoading(false);
        }
      } catch (e) {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : String(e));
          setLoading(false);
        }
      } finally {
        if (!cancelled) timer = setTimeout(pull, POLL_MS);
      }
    }

    pull();
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, [client]);

  const metrics = useMemo<FanovoMetrics>(() => {
    const cutoff =
      head !== null && head > BLOCKS_PER_DAY ? head - BLOCKS_PER_DAY : 0n;
    const inWindow = (b: bigint) => b >= cutoff;

    let burnedLast24h = 0n;
    let countrySwaps24h = 0;
    let countryVolume24h = 0n;
    let playerTrades24h = 0;
    let countryTokensBurned24h = 0n;
    let playerTokensBurned24h = 0n;
    let playerBuyCount24h = 0;
    let playerSellCount24h = 0;
    let packBurns24h = 0n;
    let playerPackBurns24h = 0n;

    let countryBurns = 0;
    let playerTrades = 0;
    let packReveals = 0;

    for (const r of rows) {
      if (r.kind === "buy" || r.kind === "sell") {
        countryBurns++;
        if (inWindow(r.block)) {
          countrySwaps24h++;
          if (r.burned) burnedLast24h += r.burned;
          if (r.kind === "buy" && r.fanovoIn) countryVolume24h += r.fanovoIn;
          if (r.kind === "sell" && r.fanovoOut) countryVolume24h += r.fanovoOut;
        }
      } else if (r.kind === "playerBuy" || r.kind === "playerSell") {
        playerTrades++;
        if (inWindow(r.block)) {
          playerTrades24h++;
          if (r.kind === "playerBuy") {
            playerBuyCount24h++;
            if (r.burned) countryTokensBurned24h += r.burned;
          } else {
            playerSellCount24h++;
            if (r.burned) playerTokensBurned24h += r.burned;
          }
        }
      } else if (r.kind === "pack" || r.kind === "playerPack") {
        packReveals++;
        if (inWindow(r.block) && r.burned) {
          if (r.kind === "pack") {
            packBurns24h += r.burned;
            burnedLast24h += r.burned;
          } else {
            playerPackBurns24h += r.burned;
            burnedLast24h += r.burned;
          }
        }
      }
    }

    return {
      total: rows.length,
      countryBurns,
      playerTrades,
      packReveals,
      burnedLast24h,
      countrySwaps24h,
      countryVolume24h,
      playerTrades24h,
      countryTokensBurned24h,
      playerTokensBurned24h,
      playerBuyCount24h,
      playerSellCount24h,
      packBurns24h,
      playerPackBurns24h,
    };
  }, [rows, head]);

  return { rows, metrics, loading, error, head };
}

type DecodedLog = Log & {
  args: Record<string, unknown>;
  blockNumber: bigint;
  transactionHash: `0x${string}`;
  logIndex: number;
  eventName?: string;
};
