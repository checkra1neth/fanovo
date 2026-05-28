"use client";

import { useAccount, useReadContracts, useWriteContract, useWaitForTransactionReceipt, useBlockNumber } from "wagmi";
import { formatEther, parseEther, decodeEventLog } from "viem";
import { useQueryClient } from "@tanstack/react-query";
import { CONTRACTS, COUNTRIES, PLAYERS, getFlagUrl } from "@/lib/contracts";
import { playerHookAbi, fanovoTokenAbi, worldCupHookAbi, playerPackOpenerAbi } from "@/lib/abi";
import { Header } from "@/components/Header";
import Link from "next/link";
import { useState, useEffect } from "react";

function getRoleColor(role: number): string {
  if (role === 0) return "#fbbf24";
  if (role === 1) return "#60a5fa";
  return "#34d399";
}

function getRoleLabel(role: number): string {
  if (role === 0) return "CAPTAIN";
  if (role === 1) return "BEST";
  return "ROOKIE";
}

function getInitials(name: string): string {
  const parts = name.split(" ");
  if (parts.length >= 2) {
    return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  }
  return name.slice(0, 2).toUpperCase();
}

function JerseySVG({ initials, color }: { initials: string; color: string }) {
  return (
    <svg width="80" height="80" viewBox="0 0 80 80" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path
        d="M28 12 L28 8 L52 8 L52 12 L68 20 L64 32 L56 28 L56 68 L24 68 L24 28 L16 32 L12 20 Z"
        fill={`${color}15`}
        stroke={color}
        strokeWidth="1.5"
      />
      <text x="40" y="50" textAnchor="middle" fill={color} fontSize="20" fontWeight="bold" fontFamily="monospace">
        {initials}
      </text>
    </svg>
  );
}

interface Player {
  countryId: number;
  name: string;
  role: number;
  position: string;
  symbol: string;
}

interface Country {
  id: number;
  name: string;
  symbol: string;
  flag: string;
  group: string;
}

export default function CountryPlayersClient({ countryId }: { countryId: number }) {
  const country = COUNTRIES[countryId];
  const { address } = useAccount();
  const [activeModal, setActiveModal] = useState<null | { player: Player; playerAddress: string }>(null);

  if (!country) {
    return (
      <div className="min-h-screen">
        <Header />
        <main className="max-w-[900px] mx-auto px-6 py-8">
          <p className="text-[#888]">Country not found</p>
        </main>
      </div>
    );
  }

  // Get player addresses from allPlayers array
  const { data: playerAddresses } = useReadContracts({
    contracts: [0, 1, 2].map((role) => ({
      address: CONTRACTS.playerHook,
      abi: playerHookAbi,
      functionName: "allPlayers" as const,
      args: [BigInt(countryId * 3 + role)] as const,
    })),
  });

  const playerAddrs = playerAddresses?.map((r) => r.result as `0x${string}`) || [];

  // Read prices
  const { data: playerPrices } = useReadContracts({
    contracts: playerAddrs.map((addr) => ({
      address: CONTRACTS.playerHook,
      abi: playerHookAbi,
      functionName: "currentPrice" as const,
      args: [addr] as const,
    })),
  });

  // Read reserves
  const { data: playerReserves } = useReadContracts({
    contracts: playerAddrs.map((addr) => ({
      address: CONTRACTS.playerHook,
      abi: playerHookAbi,
      functionName: "getPlayerReserves" as const,
      args: [addr] as const,
    })),
  });

  // Read curve states (for packsMinted)
  const { data: curveStates } = useReadContracts({
    contracts: playerAddrs.map((addr) => ({
      address: CONTRACTS.playerHook,
      abi: playerHookAbi,
      functionName: "curves" as const,
      args: [addr] as const,
    })),
  });

  // Read user player token balances
  const { data: playerBalances } = useReadContracts({
    contracts: playerAddrs.map((addr) => ({
      address: addr || "0x0000000000000000000000000000000000000000",
      abi: fanovoTokenAbi,
      functionName: "balanceOf" as const,
      args: [address || "0x0000000000000000000000000000000000000000"] as const,
    })),
  });

  // Read country token address
  const { data: countryTokenAddr } = useReadContracts({
    contracts: [{
      address: CONTRACTS.worldCupHook,
      abi: worldCupHookAbi,
      functionName: "getCountryToken" as const,
      args: [BigInt(countryId)] as const,
    }],
  });

  const countryToken = countryTokenAddr?.[0]?.result as `0x${string}` | undefined;

  // Read country curve state (for country pack count → phase2 gate)
  const { data: countryCurveState } = useReadContracts({
    contracts: countryToken ? [{
      address: CONTRACTS.worldCupHook,
      abi: worldCupHookAbi,
      functionName: "getCurveState" as const,
      args: [countryToken] as const,
    }] : [],
  });

  const countryCirculating = countryCurveState?.[0]?.result
    ? Number(formatEther((countryCurveState[0].result as [bigint, bigint, boolean])[1]))
    : 0;
  const PACKS_THRESHOLD = 450;
  const isPhase2 = countryCirculating >= PACKS_THRESHOLD;

  // Read user country token balance
  const { data: countryBalance } = useReadContracts({
    contracts: countryToken ? [{
      address: countryToken,
      abi: fanovoTokenAbi,
      functionName: "balanceOf" as const,
      args: [address || "0x0000000000000000000000000000000000000000"] as const,
    }] : [],
  });

  const userCountryBal = countryBalance?.[0]?.result ? Number(formatEther(countryBalance[0].result as bigint)) : 0;

  const countryPlayers = PLAYERS.filter((p) => p.countryId === countryId);
  const totalCountryPacks = countryCirculating;
  const packsRemaining = Math.max(0, 450 - totalCountryPacks);

  return (
    <div className="min-h-screen">
      <Header />
      <main className="max-w-[900px] mx-auto px-6 py-8">
        {/* Header */}
        <Link href="/markets" className="text-xs text-[#888] hover:text-white mb-4 inline-block">
          ← All countries
        </Link>
        <div className="flex items-center gap-3 mb-2">
          <img src={getFlagUrl(country.symbol)} alt="" className="w-10 h-7 rounded object-cover" />
          <h1 className="text-3xl font-bold">{country.name} players</h1>
          {isPhase2 ? (
            <span className="text-[10px] bg-[#34d399]/10 text-[#34d399] px-2 py-1 rounded font-semibold tracking-wider">TRADING LIVE</span>
          ) : (
            <span className="text-[10px] bg-[#ff2d55]/10 text-[#ff2d55] px-2 py-1 rounded font-semibold tracking-wider">PHASE 1</span>
          )}
        </div>
        <p className="text-sm text-[#888] mb-8">
          {countryPlayers.length} player markets · {isPhase2 ? "Phase 2 · trading live" : `Phase 1 · ${packsRemaining}/450 packs remaining`}
        </p>

        {/* Player Cards Grid */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {countryPlayers.map((player, idx) => {
            const price = playerPrices?.[idx]?.result ? Number(formatEther(playerPrices[idx].result as bigint)) : 0;
            const reserves = playerReserves?.[idx]?.result;
            const circulating = reserves ? Number(formatEther((reserves as [bigint, bigint])[1])) : 0;
            const curve = curveStates?.[idx]?.result;
            const packsMinted = curve ? Number((curve as unknown as [bigint, bigint, string, number, number, number, boolean])[5]) : 0;
            const roleCap = player.role === 0 ? 150 : player.role === 1 ? 50 : 250;
            const maxSupply = player.role === 0 ? 1500 : player.role === 1 ? 500 : 2500;
            const roleColor = getRoleColor(player.role);
            const roleLabel = getRoleLabel(player.role);
            const playerAddress = playerAddrs[idx];
            const userBalance = playerBalances?.[idx]?.result ? Number(formatEther(playerBalances[idx].result as bigint)) : 0;

            return (
              <div key={player.symbol} className="card p-6 space-y-4 flex flex-col items-center text-center">
                <div className="relative">
                  <JerseySVG initials={getInitials(player.name)} color={roleColor} />
                </div>
                <span className="text-[10px] tracking-widest" style={{ color: roleColor }}>{roleLabel}</span>
                <div>
                  <h3 className="text-lg font-bold">{player.name}</h3>
                  <p className="text-xs text-[#555] uppercase tracking-wider">{player.symbol}</p>
                </div>
                <div className="w-full grid grid-cols-2 gap-4 text-left">
                  <div>
                    <p className="text-[10px] text-[#555] uppercase tracking-wider">Pack Mints</p>
                    <p className="text-sm font-mono">{packsMinted} / {roleCap}</p>
                  </div>
                  <div>
                    <p className="text-[10px] text-[#555] uppercase tracking-wider">Supply</p>
                    <p className="text-sm font-mono">{circulating.toFixed(0)} / {maxSupply}</p>
                  </div>
                  <div>
                    <p className="text-[10px] text-[#555] uppercase tracking-wider">Price ({country.symbol})</p>
                    <p className="text-sm font-mono">{price.toFixed(4)}</p>
                  </div>
                  <div>
                    <p className="text-[10px] text-[#555] uppercase tracking-wider">You Own</p>
                    <p className="text-sm font-mono">{userBalance.toFixed(0)}</p>
                  </div>
                </div>
                <div className="w-full grid grid-cols-2 gap-3 pt-2">
                  <button
                    className="py-2.5 rounded-lg border border-white/[0.08] text-xs font-semibold hover:bg-white/[0.03] transition-colors"
                    onClick={() => setActiveModal({ player, playerAddress })}
                  >
                    Chart
                  </button>
                  <button
                    className={`py-2.5 rounded-lg text-xs font-semibold transition-colors ${
                      isPhase2
                        ? "bg-[#ff2d55] hover:bg-[#ff2d55]/80 text-white"
                        : "bg-[#ff2d55]/20 text-[#ff2d55]/50 cursor-not-allowed"
                    }`}
                    disabled={!isPhase2}
                    onClick={() => isPhase2 && setActiveModal({ player, playerAddress })}
                  >
                    {isPhase2 ? "Trade" : "Locked"}
                  </button>
                </div>
              </div>
            );
          })}
        </div>

        {/* Open Player Packs Section */}
        {!isPhase2 && (
          <PlayerPackOpenerSection
            countryId={countryId}
            country={country}
            userCountryBal={userCountryBal}
            totalCountryPacks={totalCountryPacks}
            packsRemaining={packsRemaining}
            countryToken={countryToken}
          />
        )}
      </main>

      {/* Trade Modal */}
      {activeModal && (
        <PlayerTradeModal
          player={activeModal.player}
          playerAddress={activeModal.playerAddress}
          country={country}
          userCountryBal={userCountryBal}
          isPhase2={isPhase2}
          packsRemaining={packsRemaining}
          onClose={() => setActiveModal(null)}
        />
      )}
    </div>
  );
}

function PlayerPackOpenerSection({
  countryId,
  country,
  userCountryBal,
  totalCountryPacks,
  packsRemaining,
  countryToken,
}: {
  countryId: number;
  country: Country;
  userCountryBal: number;
  totalCountryPacks: number;
  packsRemaining: number;
  countryToken: `0x${string}` | undefined;
}) {
  const { address } = useAccount();
  const [commitCount, setCommitCount] = useState<1 | 10 | 50>(1);
  const [revealedPlayers, setRevealedPlayers] = useState<{ name: string; role: string }[]>([]);
  const queryClient = useQueryClient();

  const { data: blockNumber } = useBlockNumber({ watch: true });

  // Read commit status — ABI returns: (countryIndex, count, revealBlock, timestamp, revealed, exists)
  const { data: commitData } = useReadContracts({
    contracts: address ? [{
      address: CONTRACTS.playerPackOpener,
      abi: playerPackOpenerAbi,
      functionName: "commits" as const,
      args: [address, countryId] as const,
    }] : [],
  });

  const commit = commitData?.[0]?.result as [number, number, bigint, bigint, boolean, boolean] | undefined;
  const hasCommit = commit?.[5] || false;
  const commitCount_val = commit?.[1] || 0;
  const revealBlock = commit ? Number(commit[2]) : 0;
  const isRevealed = commit?.[4] || false;

  // Read country token allowance
  const { data: allowance, isLoading: isAllowanceLoading } = useReadContracts({
    contracts: countryToken && address ? [{
      address: countryToken,
      abi: fanovoTokenAbi,
      functionName: "allowance" as const,
      args: [address, CONTRACTS.playerPackOpener] as const,
    }] : [],
  });

  const needsApproval = !isAllowanceLoading && allowance !== undefined && (allowance[0]?.result as bigint || 0n) < parseEther((commitCount + 10).toString());

  const blocksRemaining = blockNumber && revealBlock > 0
    ? Math.max(0, revealBlock - Number(blockNumber))
    : 0;
  const canReveal = hasCommit && !isRevealed && blocksRemaining <= 0;

  const { writeContract: approve, data: approveTx } = useWriteContract();
  const { writeContract: commitTx, data: commitHash } = useWriteContract();
  const { writeContract: revealTx, data: revealHash } = useWriteContract();

  const { isLoading: isApproving, data: approveReceipt } = useWaitForTransactionReceipt({ hash: approveTx });
  const { isLoading: isCommitPending, data: commitReceipt } = useWaitForTransactionReceipt({ hash: commitHash });
  const { isLoading: isRevealPending, data: revealReceipt } = useWaitForTransactionReceipt({ hash: revealHash });

  // Invalidate queries after successful transactions only
  useEffect(() => {
    if (commitReceipt?.status === "success" || revealReceipt?.status === "success" || approveReceipt?.status === "success") {
      queryClient.invalidateQueries({ queryKey: ["readContract"] });
    }
  }, [commitReceipt, revealReceipt, approveReceipt, queryClient]);

  // Decode reveal events
  useEffect(() => {
    if (revealReceipt?.status === "success") {
      const players: { name: string; role: string }[] = [];
      for (const log of revealReceipt.logs) {
        try {
          const decoded = decodeEventLog({
            abi: playerPackOpenerAbi,
            data: log.data,
            topics: log.topics,
          });
          if (decoded.eventName === "PlayerPackRevealed") {
            const args = decoded.args as unknown as { player: `0x${string}`; countryIndex: number; role: number };
            const roleName = args.role === 0 ? "CAPTAIN" : args.role === 1 ? "BEST" : "ROOKIE";
            players.push({ name: `${roleName} #${args.countryIndex}`, role: roleName });
          }
        } catch { /* ignore */ }
      }
      if (players.length > 0) setRevealedPlayers(players);
    }
  }, [revealReceipt]);

  const handleApprove = () => {
    if (!countryToken) return;
    approve({
      address: countryToken,
      abi: fanovoTokenAbi,
      functionName: "approve",
      args: [CONTRACTS.playerPackOpener, parseEther("100000")],
    });
  };

  const handleCommit = () => {
    setRevealedPlayers([]);
    commitTx({
      address: CONTRACTS.playerPackOpener,
      abi: playerPackOpenerAbi,
      functionName: "commitPlayerPacks",
      args: [countryId, commitCount],
    });
  };

  const handleReveal = () => {
    setRevealedPlayers([]);
    revealTx({
      address: CONTRACTS.playerPackOpener,
      abi: playerPackOpenerAbi,
      functionName: "revealPlayerPacks",
      args: [countryId],
    });
  };

  return (
    <div className="card p-6 mt-8 space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-[10px] text-[#555] uppercase tracking-wider">Open {country.name} Player Packs</p>
          <p className="text-sm text-[#888] mt-1">
            Each pack burns 1 {country.symbol} token and mints 1 random player from {country.name}&apos;s roster. {packsRemaining}/450 packs remaining.
          </p>
        </div>
        <div className="text-right">
          <p className="text-[10px] text-[#555] uppercase tracking-wider">Your {country.symbol}</p>
          <p className="text-lg font-mono">{userCountryBal.toFixed(0)}</p>
        </div>
      </div>

      <div className="h-2 bg-[#161616] rounded-full overflow-hidden border border-white/[0.04]">
        <div className="h-full bg-[#ff2d55] rounded-full transition-all" style={{ width: `${Math.max((totalCountryPacks / 450) * 100, 0.5)}%` }} />
      </div>
      <div className="flex justify-between text-xs text-[#555]">
        <span>{totalCountryPacks} opened</span>
        <span>{totalCountryPacks} / 450</span>
      </div>

      {/* Revealed players */}
      {revealedPlayers.length > 0 && (
        <div className="bg-[#34d399]/10 border border-[#34d399]/30 rounded-lg p-4">
          <p className="text-sm font-medium text-[#34d399] mb-2">🎉 Players Revealed!</p>
          <div className="flex flex-wrap gap-2">
            {revealedPlayers.map((p, i) => (
              <span key={i} className="px-2 py-1 bg-[#161616] rounded text-xs">{p.role}</span>
            ))}
          </div>
        </div>
      )}

      {/* Commit Status */}
      {hasCommit && !isRevealed && (
        <div className="bg-[#161616] border border-white/[0.06] rounded-lg p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium">{commitCount_val} pack{commitCount_val > 1 ? 's' : ''} committed</p>
              <p className="text-xs text-[#555] mt-1">
                {canReveal ? "Ready to reveal!" : `Waiting ${blocksRemaining} more block${blocksRemaining !== 1 ? 's' : ''}...`}
              </p>
            </div>
            <button
              onClick={handleReveal}
              disabled={!canReveal || isRevealPending}
              className={`px-4 py-2 rounded-lg text-xs font-semibold transition-colors ${
                canReveal ? "bg-[#ff2d55] hover:bg-[#ff2d55]/80 text-white" : "bg-[#161616] text-[#555] cursor-not-allowed"
              }`}
            >
              {isRevealPending ? "Revealing..." : canReveal ? "Reveal" : `Wait ${blocksRemaining}`}
            </button>
          </div>
        </div>
      )}

      {/* Commit UI */}
      {!hasCommit && (
        <div className="space-y-3">
          <div className="flex gap-2">
            {[1, 10, 50].map((count) => (
              <button
                key={count}
                onClick={() => setCommitCount(count as 1 | 10 | 50)}
                className={`flex-1 py-2 rounded-lg text-xs font-semibold transition-colors ${
                  commitCount === count ? "bg-[#ff2d55] text-white" : "bg-[#161616] text-[#555] hover:text-white"
                }`}
              >
                {count} Pack{count > 1 ? 's' : ''}
              </button>
            ))}
          </div>

          {needsApproval ? (
            <button
              onClick={handleApprove}
              disabled={isApproving}
              className="w-full py-3 rounded-lg text-sm font-semibold bg-[#f59e0b] hover:bg-[#f59e0b]/80 text-white transition-colors"
            >
              {isApproving ? "Approving..." : `Approve ${country.symbol}`}
            </button>
          ) : (
            <button
              onClick={handleCommit}
              disabled={isCommitPending || isAllowanceLoading || userCountryBal < commitCount}
              className={`w-full py-3 rounded-lg text-sm font-semibold transition-colors ${
                !isAllowanceLoading && userCountryBal >= commitCount
                  ? "bg-[#ff2d55] hover:bg-[#ff2d55]/80 text-white"
                  : "bg-[#ff2d55]/20 text-[#ff2d55]/50 cursor-not-allowed"
              }`}
            >
              {isCommitPending
                ? "Committing..."
                : isAllowanceLoading
                  ? "Checking allowance..."
                  : userCountryBal >= commitCount
                    ? `Commit ${commitCount} Pack${commitCount > 1 ? 's' : ''} · Burn ${commitCount} ${country.symbol}`
                    : `Need ${commitCount} ${country.symbol}`
              }
            </button>
          )}
          <p className="text-xs text-[#555] text-center">
            After committing, wait ~10 blocks (~30 seconds) then click Reveal to open your packs.
          </p>
        </div>
      )}
    </div>
  );
}

function PlayerTradeModal({
  player,
  playerAddress,
  country,
  userCountryBal,
  isPhase2,
  packsRemaining,
  onClose,
}: {
  player: Player;
  playerAddress: string;
  country: Country;
  userCountryBal: number;
  isPhase2: boolean;
  packsRemaining: number;
  onClose: () => void;
}) {
  const [tab, setTab] = useState<"chart" | "trade" | "stats">("trade");
  const [tradeMode, setTradeMode] = useState<"buy" | "sell">("buy");
  const [amount, setAmount] = useState("");

  const { data: priceData } = useReadContracts({
    contracts: playerAddress ? [{
      address: CONTRACTS.playerHook,
      abi: playerHookAbi,
      functionName: "currentPrice" as const,
      args: [playerAddress as `0x${string}`] as const,
    }] : [],
  });

  const { data: reservesData } = useReadContracts({
    contracts: playerAddress ? [{
      address: CONTRACTS.playerHook,
      abi: playerHookAbi,
      functionName: "getPlayerReserves" as const,
      args: [playerAddress as `0x${string}`] as const,
    }] : [],
  });

  const { data: curveData } = useReadContracts({
    contracts: playerAddress ? [{
      address: CONTRACTS.playerHook,
      abi: playerHookAbi,
      functionName: "getPlayerReserves" as const,
      args: [playerAddress as `0x${string}`],
    }] : [],
  });

  const price = priceData?.[0]?.result ? Number(formatEther(priceData[0].result as bigint)) : 0;
  const reserves = reservesData?.[0]?.result;
  const circulating = reserves ? Number(formatEther((reserves as [bigint, bigint])[1])) : 0;
  const realCountry = reserves ? Number(formatEther((reserves as [bigint, bigint])[0])) : 0;
  const curve = curveData?.[0]?.result;
  const packsMinted = curve ? Number((curve as unknown as [bigint, bigint, string, number, number, number, boolean])[5]) : 0;
  const maxSupply = player.role === 0 ? 1500 : player.role === 1 ? 500 : 2500;
  const roleCap = player.role === 0 ? 150 : player.role === 1 ? 50 : 250;
  const marketCap = price * circulating;

  const roleColor = getRoleColor(player.role);
  const roleLabel = getRoleLabel(player.role);

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center pt-16 bg-black/80 backdrop-blur-sm" onClick={onClose}>
      <div className="w-full max-w-[500px] bg-[#0d0d0d] border border-white/[0.08] rounded-2xl overflow-hidden" onClick={(e) => e.stopPropagation()}>
        <div className="p-6 border-b border-white/[0.08]">
          <div className="flex items-center justify-between mb-4">
            <button onClick={onClose} className="text-xs text-[#888] hover:text-white">← Players</button>
            <button onClick={onClose} className="text-[#888] hover:text-white">×</button>
          </div>
          <div className="flex items-center gap-3">
            <div className="scale-75 origin-left">
              <JerseySVG initials={getInitials(player.name)} color={roleColor} />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-[10px] tracking-widest" style={{ color: roleColor }}>{roleLabel}</span>
                <span className="text-[10px] text-[#555]">· {country.symbol}</span>
              </div>
              <h2 className="text-xl font-bold">{player.name}</h2>
              <div className="flex items-center gap-1.5 mt-0.5">
                <img src={getFlagUrl(country.symbol)} alt="" className="w-4 h-3 rounded object-cover" />
                <span className="text-xs text-[#555]">{country.name}</span>
              </div>
            </div>
            <div className="ml-auto text-right">
              <p className="text-2xl font-mono font-bold">{price.toFixed(3)}</p>
              <p className="text-xs text-[#555]">{country.symbol}</p>
            </div>
          </div>
        </div>

        <div className="flex border-b border-white/[0.08]">
          {(["chart", "trade", "stats"] as const).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`flex-1 py-3 text-sm font-medium capitalize ${
                tab === t ? "text-white border-b-2 border-[#ff2d55]" : "text-[#555]"
              }`}
            >
              {t}
            </button>
          ))}
        </div>

        <div className="p-6">
          {tab === "chart" && (
            <div className="space-y-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-[10px] text-[#555] uppercase tracking-wider">Current Price</p>
                  <p className="text-xs text-[#555]">Quoted in {country.symbol}, per 1 {player.symbol}</p>
                </div>
                <div className="text-right">
                  <p className="text-lg font-mono">{price.toFixed(4)} {country.symbol}</p>
                </div>
              </div>

              {/* Real on-chain stats */}
              <div className="grid grid-cols-2 gap-4">
                <div className="card p-4">
                  <p className="text-[10px] text-[#555] uppercase tracking-wider mb-1">Circulating</p>
                  <p className="text-xl font-bold font-mono">{circulating.toFixed(0)}</p>
                  <p className="text-xs text-[#555]">{player.symbol}</p>
                </div>
                <div className="card p-4">
                  <p className="text-[10px] text-[#555] uppercase tracking-wider mb-1">Market Cap</p>
                  <p className="text-xl font-bold font-mono">{marketCap.toFixed(2)}</p>
                  <p className="text-xs text-[#555]">{country.symbol}</p>
                </div>
                <div className="card p-4">
                  <p className="text-[10px] text-[#555] uppercase tracking-wider mb-1">Liquidity</p>
                  <p className="text-xl font-bold font-mono">{realCountry.toFixed(2)}</p>
                  <p className="text-xs text-[#555]">{country.symbol} in curve</p>
                </div>
                <div className="card p-4">
                  <p className="text-[10px] text-[#555] uppercase tracking-wider mb-1">Pack Mints</p>
                  <p className="text-xl font-bold font-mono">{packsMinted} / {roleCap}</p>
                  <p className="text-xs text-[#555]">of role cap</p>
                </div>
              </div>

              <p className="text-xs text-[#555] text-center">
                Price history and trade log require an indexer. Current data is read directly from the PlayerHook contract.
              </p>
            </div>
          )}

          {tab === "trade" && (
            <div className="space-y-4">
              {!isPhase2 ? (
                <div className="text-center py-8">
                  <p className="text-sm text-[#888]">Trading opens when all 450 packs are opened</p>
                  <p className="text-xs text-[#555] mt-1">{packsRemaining} country packs remaining</p>
                </div>
              ) : (
                <>
                  <div className="flex rounded-lg overflow-hidden border border-white/[0.08]">
                    <button
                      onClick={() => setTradeMode("buy")}
                      className={`flex-1 py-2.5 text-sm font-medium ${tradeMode === "buy" ? "bg-[#ff2d55] text-white" : "text-[#555]"}`}
                    >
                      Buy
                    </button>
                    <button
                      onClick={() => setTradeMode("sell")}
                      className={`flex-1 py-2.5 text-sm font-medium ${tradeMode === "sell" ? "bg-[#ff2d55] text-white" : "text-[#555]"}`}
                    >
                      Sell
                    </button>
                  </div>

                  <div className="card p-4 space-y-3">
                    <div className="flex justify-between text-[10px] text-[#555] uppercase tracking-wider">
                      <span>You Pay</span>
                      <span>Balance: {userCountryBal.toFixed(2)} {country.symbol}</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <input
                        type="number"
                        value={amount}
                        onChange={(e) => setAmount(e.target.value)}
                        placeholder="0.0"
                        className="bg-transparent text-2xl font-mono outline-none w-32"
                      />
                      <div className="flex items-center gap-2 bg-[#161616] rounded-lg px-3 py-1.5">
                        <img src={getFlagUrl(country.symbol)} alt="" className="w-5 h-3.5 rounded object-cover" />
                        <span className="text-sm font-medium">{country.symbol}</span>
                      </div>
                    </div>
                    <div className="flex gap-2">
                      {["25%", "50%", "MAX"].map((p) => (
                        <button key={p} className="px-2 py-1 rounded text-[10px] bg-[#161616] text-[#555] hover:text-white transition-colors">
                          {p}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="flex justify-center">
                    <div className="w-8 h-8 rounded-full bg-[#161616] flex items-center justify-center text-[#555]">↓</div>
                  </div>

                  <div className="card p-4 space-y-3">
                    <div className="flex justify-between text-[10px] text-[#555] uppercase tracking-wider">
                      <span>You Receive (est.)</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-2xl font-mono text-[#555]">
                        {amount && price > 0 ? (Number(amount) / price).toFixed(4) : "0.0"}
                      </span>
                      <div className="flex items-center gap-2 bg-[#161616] rounded-lg px-3 py-1.5">
                        <div className="scale-50 origin-center -my-2">
                          <JerseySVG initials={getInitials(player.name)} color={roleColor} />
                        </div>
                        <span className="text-sm font-medium">{player.symbol}</span>
                      </div>
                    </div>
                  </div>

                  <div className="card p-4 space-y-2 text-xs">
                    <div className="flex justify-between">
                      <span className="text-[#555]">Curve price</span>
                      <span className="font-mono">{price.toFixed(3)} {country.symbol} / {player.symbol}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-[#555]">Burn fee (5%)</span>
                      <span className="font-mono">-</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-[#555]">Max slippage</span>
                      <span className="font-mono">0.5%</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-[#555]">Route</span>
                      <span className="font-mono">PlayerCurve</span>
                    </div>
                  </div>

                  <button className="w-full py-3.5 bg-[#ff2d55] hover:bg-[#ff2d55]/80 text-white font-semibold rounded-lg transition-colors">
                    Enter an amount
                  </button>
                  <p className="text-xs text-[#555] text-center">
                    Player curves pair against {country.symbol}. 5% of every swap is burned.
                  </p>
                </>
              )}
            </div>
          )}

          {tab === "stats" && (
            <div className="space-y-6">
              <div className="grid grid-cols-2 gap-6">
                <div>
                  <p className="text-[10px] text-[#555] uppercase tracking-wider mb-1">Circulating Supply</p>
                  <p className="text-xl font-bold font-mono">{circulating.toFixed(0)}</p>
                  <p className="text-xs text-[#555]">{(circulating / maxSupply * 100).toFixed(1)}% of {maxSupply} cap</p>
                </div>
                <div>
                  <p className="text-[10px] text-[#555] uppercase tracking-wider mb-1">Price</p>
                  <p className="text-xl font-bold font-mono">{price.toFixed(3)} {country.symbol}</p>
                  <p className="text-xs text-[#555]">per 1 {player.symbol}</p>
                </div>
                <div>
                  <p className="text-[10px] text-[#555] uppercase tracking-wider mb-1">Market Cap</p>
                  <p className="text-xl font-bold font-mono">{marketCap.toFixed(2)} {country.symbol}</p>
                  <p className="text-xs text-[#555]">price × circulating</p>
                </div>
                <div>
                  <p className="text-[10px] text-[#555] uppercase tracking-wider mb-1">Liquidity</p>
                  <p className="text-xl font-bold font-mono">{realCountry.toFixed(2)} {country.symbol}</p>
                  <p className="text-xs text-[#555]">real {country.symbol} backing the curve</p>
                </div>
                <div>
                  <p className="text-[10px] text-[#555] uppercase tracking-wider mb-1">Pack Mints</p>
                  <p className="text-xl font-bold font-mono">{packsMinted} / {roleCap}</p>
                  <p className="text-xs text-[#555]">seeds curve liquidity</p>
                </div>
                <div>
                  <p className="text-[10px] text-[#555] uppercase tracking-wider mb-1">Supply Cap</p>
                  <p className="text-xl font-bold font-mono">{maxSupply}</p>
                  <p className="text-xs text-[#555]">{roleLabel} role</p>
                </div>
              </div>

              <div className="card p-4">
                <p className="text-[10px] text-[#555] uppercase tracking-wider mb-3">Supply Curve</p>
                <div className="h-2 bg-[#161616] rounded-full overflow-hidden">
                  <div
                    className="h-full rounded-full"
                    style={{
                      width: `${Math.min((circulating / maxSupply) * 100, 100)}%`,
                      backgroundColor: roleColor,
                    }}
                  />
                </div>
                <div className="flex justify-between text-xs mt-2 text-[#555]">
                  <span>0</span>
                  <span>{circulating.toFixed(0)} circulating</span>
                  <span>{maxSupply}</span>
                </div>
                <p className="text-xs text-[#555] mt-3">
                  Each pack mints 1 {player.symbol} and seeds the bonding curve in {country.symbol}.
                </p>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
