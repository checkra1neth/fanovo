"use client";

import {
  QueryClient,
  QueryClientProvider,
  type Query,
} from "@tanstack/react-query";
import { PersistQueryClientProvider } from "@tanstack/react-query-persist-client";
import { createSyncStoragePersister } from "@tanstack/query-sync-storage-persister";
import { WagmiProvider, deserialize, serialize } from "wagmi";
import { config } from "@/lib/wagmi";
import { useMemo, useState } from "react";
import { NetworkGuard } from "@/components/NetworkGuard";

// Functions worth persisting across reloads. Constants and slow-moving on-chain
// state. Volatile reads (e.g. allowance for the current tx, ephemeral UI state)
// fall through and are not persisted.
const PERSIST_FUNCTIONS = new Set([
  // Tier 1 — immutable protocol constants
  "MAX_SUPPLY",
  "PRICE_USD",
  "SWAP_FEE_BPS",
  "BPS_DENOM",
  "PACK_MINT_THRESHOLD",
  "PACKS_PER_COUNTRY",
  "CAP_CAPTAIN",
  "CAP_BEST",
  "CAP_ROOKIE",
  "MAX_SUPPLY_CAPTAIN",
  "MAX_SUPPLY_BEST",
  "MAX_SUPPLY_ROOKIE",
  "VIRTUAL_FANOVO",
  "getCountryToken",
  "getPlayerToken",
  "getPlayer",
  "name",
  "symbol",
  "decimals",
  // Tier 2 — slow-moving state, fine to show stale on first paint while
  // we refetch in the background.
  "totalSupply",
  "totalPacksOpened",
  "getCurveState",
  "getPlayerReserves",
  "packsByCountry",
  "packsRemainingForCountry",
  "currentPrice",
  "playersLength",
  "phase2ByCountry",
]);

const ONE_HOUR = 60 * 60 * 1000;
const ONE_DAY = 24 * ONE_HOUR;

function readContractFunctionName(query: Query): string | undefined {
  const key = query.queryKey;
  if (!Array.isArray(key) || key.length < 2) return undefined;
  if (key[0] !== "readContract") return undefined;
  const params = key[1] as { functionName?: string } | undefined;
  return params?.functionName;
}

export function Providers({ children }: { children: React.ReactNode }) {
  // One QueryClient for the lifetime of the app. Defaults are tuned for chain
  // reads: 30s freshness, no refetch on focus, retain in memory for a day.
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 30_000,
            gcTime: ONE_DAY,
            refetchOnWindowFocus: false,
            retry: 1,
          },
        },
      })
  );

  const persister = useMemo(() => {
    if (typeof window === "undefined") return null;
    return createSyncStoragePersister({
      storage: window.localStorage,
      key: "fanovo-rq-cache-v1",
      // BigInt-safe (wagmi exports a serialize that handles bigint).
      serialize,
      deserialize,
      throttleTime: 1_000,
    });
  }, []);

  // Only persist the queries we trust — known function names from our ABI.
  const shouldDehydrateQuery = (query: Query) => {
    if (query.state.status !== "success" || query.state.error) return false;
    const fn = readContractFunctionName(query);
    return fn ? PERSIST_FUNCTIONS.has(fn) : false;
  };

  if (!persister) {
    return (
      <WagmiProvider config={config}>
        <QueryClientProvider client={queryClient}>
          <NetworkGuard>{children}</NetworkGuard>
        </QueryClientProvider>
      </WagmiProvider>
    );
  }

  return (
    <WagmiProvider config={config}>
      <PersistQueryClientProvider
        client={queryClient}
        persistOptions={{
          persister,
          maxAge: ONE_DAY * 7,
          // Bump on contract redeploy to nuke stale persisted reads.
          buster: "fanovo-v1",
          dehydrateOptions: { shouldDehydrateQuery },
        }}
      >
        <NetworkGuard>{children}</NetworkGuard>
      </PersistQueryClientProvider>
    </WagmiProvider>
  );
}
