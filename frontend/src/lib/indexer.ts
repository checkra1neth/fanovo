"use server";

import { formatEther, parseAbiItem, type Address, type PublicClient } from "viem";
import {
  getServerClient,
  fetchLogsChunked,
  BLOCKS_PER_DAY,
  type IndexedEvent,
} from "./server-chain";
import { CONTRACTS } from "./contracts";

// ─── Constants ───────────────────────────────────────────────────────────────

// Burn amounts per pack (hardcoded from contract constants)
const PACK_BURN_FANOVO = 5n * 10n ** 16n; // 0.05 FANOVO per country pack
const PACK_BURN_COUNTRY = 5n * 10n ** 16n; // 0.05 country token per player pack

const EVENT_SPECS: { address: Address; eventName: string; abi: string }[] = [
  {
    address: CONTRACTS.worldCupHook,
    eventName: "Buy",
    abi: "event Buy(address indexed user, address indexed country, uint256 fanovoIn, uint256 countryOut, uint256 burned)",
  },
  {
    address: CONTRACTS.worldCupHook,
    eventName: "Sell",
    abi: "event Sell(address indexed user, address indexed country, uint256 countryIn, uint256 fanovoOut, uint256 burned)",
  },
  {
    address: CONTRACTS.worldCupHook,
    eventName: "PackMinted",
    abi: "event PackMinted(address indexed user, address indexed country, uint256 toCurve)",
  },
  {
    address: CONTRACTS.playerHook,
    eventName: "Buy",
    abi: "event Buy(address indexed user, address indexed player, uint256 countryIn, uint256 playerOut, uint256 burned)",
  },
  {
    address: CONTRACTS.playerHook,
    eventName: "Sell",
    abi: "event Sell(address indexed user, address indexed player, uint256 playerIn, uint256 countryOut, uint256 burned)",
  },
  {
    address: CONTRACTS.playerHook,
    eventName: "PackMinted",
    abi: "event PackMinted(address indexed user, address indexed player, uint8 countryIndex, uint8 role)",
  },
];

// ─── Types ───────────────────────────────────────────────────────────────────

export interface BurnEvent {
  txHash: `0x${string}`;
  blockNumber: bigint;
  logIndex: number;
  timestamp: number;
  side: "buy" | "sell" | "pack" | "playerPack";
  user: Address;
  asset: Address;
  burned: bigint;
  amountIn?: bigint;
  amountOut?: bigint;
}

export interface TokenomicsSummary {
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

// ─── Helpers ─────────────────────────────────────────────────────────────────

function parseBurnEvent(e: IndexedEvent): BurnEvent | null {
  const a = e.args as Record<string, unknown>;
  const base = {
    txHash: e.txHash,
    blockNumber: e.blockNumber,
    logIndex: e.logIndex,
    timestamp: 0,
    user: (a.user as Address) || "0x0",
    asset: (a.country as Address) || (a.player as Address) || "0x0",
  };

  if (e.eventName === "Buy") {
    const burned = a.burned as bigint | undefined;
    const amountIn = (a.fanovoIn ?? a.countryIn) as bigint | undefined;
    const amountOut = (a.countryOut ?? a.playerOut) as bigint | undefined;
    if (!burned) return null;
    return {
      ...base,
      side: "buy" as const,
      burned,
      amountIn,
      amountOut,
    };
  }

  if (e.eventName === "Sell") {
    const burned = a.burned as bigint | undefined;
    const amountIn = (a.countryIn ?? a.playerIn) as bigint | undefined;
    const amountOut = (a.fanovoOut ?? a.countryOut) as bigint | undefined;
    if (!burned) return null;
    return {
      ...base,
      side: "sell" as const,
      burned,
      amountIn,
      amountOut,
    };
  }

  if (e.eventName === "PackMinted") {
    const isWorldCup = e.address === CONTRACTS.worldCupHook;
    return {
      ...base,
      side: isWorldCup ? ("pack" as const) : ("playerPack" as const),
      burned: isWorldCup ? PACK_BURN_FANOVO : PACK_BURN_COUNTRY,
    };
  }

  return null;
}

function dedupeEvents(events: BurnEvent[]): BurnEvent[] {
  const seen = new Set<string>();
  return events.filter((e) => {
    const key = `${e.txHash}-${e.logIndex}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

// ─── Core ────────────────────────────────────────────────────────────────────

let _cache: {
  summary: TokenomicsSummary;
  events: BurnEvent[];
  ts: number;
  fromBlock: bigint;
  toBlock: bigint;
} | null = null;

export async function indexTokenomics(
  lookbackBlocks?: bigint
): Promise<{ summary: TokenomicsSummary; events: BurnEvent[] }> {
  const client = getServerClient();
  const tip = await client.getBlockNumber();

  // If cache is fresh (<30s) and tip hasn't moved much, return cached
  if (_cache && Date.now() - _cache.ts < 30_000 && tip <= _cache.toBlock + 5n) {
    return { summary: _cache.summary, events: _cache.events };
  }

  // Default to ~100 min (2000 blocks) for fast serverless response.
  // Full 24h scan is too slow for a cold serverless start (~60s).
  const window = lookbackBlocks ?? 2_000n;
  const fromBlock = tip > window ? tip - window : 0n;
  const toBlock = tip;

  // Fetch all events
  let allEvents: IndexedEvent[] = [];
  for (const spec of EVENT_SPECS) {
    const parsedEvent = parseAbiItem(spec.abi);
    const logs = await fetchLogsChunked(
      client,
      { address: spec.address, event: parsedEvent, eventName: spec.eventName, abi: [] },
      fromBlock,
      toBlock
    );
    // Tag with eventName since fetchLogsChunked may not preserve it
    for (const log of logs) {
      log.eventName = spec.eventName;
      log.address = spec.address;
    }
    allEvents.push(...logs);
  }

  // Sort by block desc
  allEvents.sort((a, b) =>
    a.blockNumber > b.blockNumber ? -1 : a.blockNumber < b.blockNumber ? 1 : 0
  );

  // Fetch timestamps for blocks (batch)
  const uniqueBlocks = [...new Set(allEvents.map((e) => e.blockNumber))];
  const blockTimestamps = new Map<bigint, number>();
  for (const bn of uniqueBlocks) {
    try {
      const block = await client.getBlock({ blockNumber: bn });
      blockTimestamps.set(bn, Number(block.timestamp));
    } catch {
      blockTimestamps.set(bn, Math.floor(Date.now() / 1000));
    }
  }

  // Parse and attach timestamps
  let burnEvents = allEvents
    .map((e) => {
      const be = parseBurnEvent(e);
      if (!be) return null;
      be.timestamp = blockTimestamps.get(be.blockNumber) ?? Math.floor(Date.now() / 1000);
      return be;
    })
    .filter((e): e is BurnEvent => e !== null);

  burnEvents = dedupeEvents(burnEvents);

  // Compute metrics
  const cutoffBlock = tip > BLOCKS_PER_DAY ? tip - BLOCKS_PER_DAY : 0n;

  let totalBurned = 0n;
  let burnedLast24h = 0n;
  let volumeLast24h = 0n;
  let packBurns24h = 0n;
  let playerPackBurns24h = 0n;
  let burnEventsLast24h = 0;
  let countrySwaps24h = 0;
  let playerTrades24h = 0;

  for (const e of burnEvents) {
    totalBurned += e.burned;

    const in24h = e.blockNumber >= cutoffBlock;
    if (in24h) {
      burnedLast24h += e.burned;
      burnEventsLast24h++;

      if (e.side === "pack") {
        packBurns24h += e.burned;
      } else if (e.side === "playerPack") {
        playerPackBurns24h += e.burned;
      } else if (e.side === "buy" || e.side === "sell") {
        // WorldCupHook Buy/Sell
        if (e.side === "buy" || e.side === "sell") {
          // Determine hook by checking asset or side context
          // For now, count all buy/sell as country swaps if they have fanovo amounts
          countrySwaps24h++;
          if (e.amountIn) volumeLast24h += e.amountIn;
          if (e.amountOut) volumeLast24h += e.amountOut;
        }
      }
    }
  }

  const summary: TokenomicsSummary = {
    totalBurnedWei: totalBurned.toString(),
    burnedLast24hWei: burnedLast24h.toString(),
    burnEventsLast24h,
    volumeLast24hWei: volumeLast24h.toString(),
    packBurns24hWei: packBurns24h.toString(),
    playerPackBurns24hWei: playerPackBurns24h.toString(),
    countrySwaps24h,
    playerTrades24h,
    scannedFromBlock: fromBlock.toString(),
    scannedToBlock: toBlock.toString(),
    scannedAt: Date.now(),
  };

  _cache = { summary, events: burnEvents, ts: Date.now(), fromBlock, toBlock };
  return { summary, events: burnEvents };
}

// ─── Activity feed ────────────────────────────────────────────────────────────

export interface ActivityRow {
  key: string;
  block: bigint;
  txHash: `0x${string}`;
  kind: "buy" | "sell" | "pack" | "playerPack";
  user: Address;
  asset?: Address;
  burned?: bigint;
  amountIn?: string;
  amountOut?: string;
  timestamp: number;
}

export async function getActivity(limit = 50): Promise<ActivityRow[]> {
  const { events } = await indexTokenomics();
  return events.slice(0, limit).map((e) => ({
    key: `${e.txHash}-${e.logIndex}`,
    block: e.blockNumber,
    txHash: e.txHash,
    kind: e.side,
    user: e.user,
    asset: e.asset,
    burned: e.burned,
    amountIn: e.amountIn ? formatEther(e.amountIn) : undefined,
    amountOut: e.amountOut ? formatEther(e.amountOut) : undefined,
    timestamp: e.timestamp,
  }));
}
