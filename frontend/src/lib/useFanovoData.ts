"use client";

import { useMemo } from "react";
import { useReadContracts } from "wagmi";
import { CONTRACTS, COUNTRIES, PLAYERS } from "@/lib/contracts";
import {
  packOpenerAbi,
  worldCupHookAbi,
  playerHookAbi,
} from "@/lib/abi";

// Centralised on-chain readers, so different pages (Markets, Tokenomics,
// Portfolio, HomeStats…) all hit the SAME query keys in TanStack Query and
// share a single cache entry. Args are normalised to a single shape (BigInt
// for indices, lower-cased addresses) so the cache keys are stable.

const ZERO = "0x0000000000000000000000000000000000000000" as const;

// ---------- Country tokens ----------

const COUNTRY_TOKEN_CONTRACTS = COUNTRIES.map((country) => ({
  address: CONTRACTS.worldCupHook,
  abi: worldCupHookAbi,
  functionName: "getCountryToken" as const,
  args: [BigInt(country.id)] as const,
}));

export function useCountryTokens() {
  const { data, ...rest } = useReadContracts({ contracts: COUNTRY_TOKEN_CONTRACTS });
  // Normalised array of addresses or undefined per country.
  const addresses = useMemo<(`0x${string}` | undefined)[]>(() => {
    if (!data) return COUNTRIES.map(() => undefined);
    return data.map((d) => (d.result as `0x${string}` | undefined) ?? undefined);
  }, [data]);
  return { addresses, raw: data, ...rest };
}

// ---------- Country curve states ----------

export function useCountryCurves(addresses: (`0x${string}` | undefined)[]) {
  // Build a stable contracts array based on the addresses we already have.
  const contracts = useMemo(
    () =>
      addresses.map((addr) => ({
        address: CONTRACTS.worldCupHook,
        abi: worldCupHookAbi,
        functionName: "getCurveState" as const,
        args: [addr ?? ZERO] as const,
      })),
    [addresses]
  );
  const { data, ...rest } = useReadContracts({ contracts });
  const states = useMemo<(readonly [bigint, bigint, boolean] | undefined)[]>(() => {
    if (!data) return addresses.map(() => undefined);
    return data.map(
      (d) => (d.result as readonly [bigint, bigint, boolean] | undefined) ?? undefined
    );
  }, [data, addresses]);
  return { states, raw: data, ...rest };
}

// ---------- Country spot prices via PackOpener.getPrice ----------

const COUNTRY_PRICE_CONTRACTS = COUNTRIES.map((country) => ({
  address: CONTRACTS.packOpener,
  abi: packOpenerAbi,
  functionName: "getPrice" as const,
  args: [BigInt(country.id)] as const,
}));

export function useCountryPrices() {
  const { data, ...rest } = useReadContracts({ contracts: COUNTRY_PRICE_CONTRACTS });
  const prices = useMemo<(bigint | undefined)[]>(() => {
    if (!data) return COUNTRIES.map(() => undefined);
    return data.map((d) => (d.result as bigint | undefined) ?? undefined);
  }, [data]);
  return { prices, raw: data, ...rest };
}

// ---------- Player tokens ----------

const PLAYER_TOKEN_CONTRACTS = PLAYERS.map((p) => ({
  address: CONTRACTS.playerHook,
  abi: playerHookAbi,
  functionName: "getPlayerToken" as const,
  args: [p.countryId, p.role] as const,
}));

export function usePlayerTokens() {
  const { data, ...rest } = useReadContracts({ contracts: PLAYER_TOKEN_CONTRACTS });
  const addresses = useMemo<(`0x${string}` | undefined)[]>(() => {
    if (!data) return PLAYERS.map(() => undefined);
    return data.map((d) => (d.result as `0x${string}` | undefined) ?? undefined);
  }, [data]);
  return { addresses, raw: data, ...rest };
}

// ---------- Player reserves ----------

export function usePlayerReserves(addresses: (`0x${string}` | undefined)[]) {
  const contracts = useMemo(
    () =>
      addresses.map((addr) => ({
        address: CONTRACTS.playerHook,
        abi: playerHookAbi,
        functionName: "getPlayerReserves" as const,
        args: [addr ?? ZERO] as const,
      })),
    [addresses]
  );
  const { data, ...rest } = useReadContracts({ contracts });
  const reserves = useMemo<(readonly [bigint, bigint] | undefined)[]>(() => {
    if (!data) return addresses.map(() => undefined);
    return data.map(
      (d) => (d.result as readonly [bigint, bigint] | undefined) ?? undefined
    );
  }, [data, addresses]);
  return { reserves, raw: data, ...rest };
}

// ---------- Player packs per country ----------

const PLAYER_PACKS_CONTRACTS = COUNTRIES.map((country) => ({
  address: CONTRACTS.playerHook,
  abi: playerHookAbi,
  functionName: "packsByCountry" as const,
  args: [country.id] as const,
}));

export function usePlayerPacksByCountry() {
  const { data, ...rest } = useReadContracts({ contracts: PLAYER_PACKS_CONTRACTS });
  const counts = useMemo<number[]>(() => {
    if (!data) return COUNTRIES.map(() => 0);
    return data.map((d) => (d.result ? Number(d.result) : 0));
  }, [data]);
  return { counts, raw: data, ...rest };
}

// ---------- Country phase2 status ----------

const PHASE2_CONTRACTS = COUNTRIES.map((country) => ({
  address: CONTRACTS.playerHook,
  abi: playerHookAbi,
  functionName: "phase2ByCountry" as const,
  args: [country.id] as const,
}));

export function useCountryPhase2() {
  const { data, ...rest } = useReadContracts({ contracts: PHASE2_CONTRACTS });
  const flags = useMemo<boolean[]>(() => {
    if (!data) return COUNTRIES.map(() => false);
    return data.map((d) => Boolean(d.result));
  }, [data]);
  return { flags, raw: data, ...rest };
}
