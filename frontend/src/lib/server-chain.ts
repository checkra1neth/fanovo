import { createPublicClient, http, type PublicClient, type Address, type Log } from "viem";
import { xLayer } from "viem/chains";

const RPC_URL = process.env.RPC_URL || "https://rpc.xlayer.tech";

let _client: PublicClient | null = null;

export function getServerClient(): PublicClient {
  if (_client) return _client;
  _client = createPublicClient({
    chain: xLayer,
    transport: http(RPC_URL, {
      batch: true,
      timeout: 15_000,
    }),
  });
  return _client;
}

// X Layer ~3s blocks
export const BLOCKS_PER_DAY = 28_800n;
export const BLOCKS_PER_HOUR = 1_200n;

// X Layer RPC caps eth_getLogs at 100 blocks per call
export const LOGS_CHUNK = 95n;

export interface EventDef {
  address: Address;
  abi: readonly unknown[];
  eventName: string;
  event: unknown;
}

export interface IndexedEvent {
  txHash: `0x${string}`;
  blockNumber: bigint;
  logIndex: number;
  timestamp?: number;
  eventName: string;
  address: Address;
  args: Record<string, unknown>;
}

export async function fetchLogsChunked(
  client: PublicClient,
  def: EventDef,
  fromBlock: bigint,
  toBlock: bigint
): Promise<IndexedEvent[]> {
  const out: IndexedEvent[] = [];
  let cursor = fromBlock;
  while (cursor <= toBlock) {
    const end = cursor + LOGS_CHUNK - 1n > toBlock ? toBlock : cursor + LOGS_CHUNK - 1n;
    try {
      const logs = await client.getLogs({
        address: def.address,
        event: {
          type: "event",
          name: def.eventName,
          inputs: def.abi.find(
            (i): i is { type: "event"; name: string; inputs: unknown[] } =>
              typeof i === "object" &&
              i !== null &&
              (i as { type?: string }).type === "event" &&
              (i as { name?: string }).name === def.eventName
          )?.inputs,
        } as never,
        fromBlock: cursor,
        toBlock: end,
      });

      for (const l of logs as Log[]) {
        out.push({
          txHash: l.transactionHash ?? "0x0",
          blockNumber: l.blockNumber ?? 0n,
          logIndex: l.logIndex ?? 0,
          eventName: def.eventName,
          address: def.address,
          args: (l as unknown as { args: Record<string, unknown> }).args,
        });
      }
    } catch (err) {
      // Some RPCs error on large ranges or missing topics — log and continue
      console.error(`[indexer] getLogs error ${def.eventName} ${cursor}-${end}:`, err);
    }
    cursor = end + 1n;
  }
  return out;
}
