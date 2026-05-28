"use client";

import { useState, useEffect } from "react";
import { useAccount, useReadContracts, useWriteContract, useWaitForTransactionReceipt } from "wagmi";
import { formatEther } from "viem";
import { useQueryClient } from "@tanstack/react-query";
import { CONTRACTS, PLAYERS, COUNTRIES, getFlagUrl } from "@/lib/contracts";
import { lineupsGameAbi, fanovoTokenAbi } from "@/lib/abi";

interface Round {
  id: number;
  name: string;
  entryFee: bigint;
  lockTime: bigint;
  startTime: bigint;
  endTime: bigint;
  totalPool: bigint;
  totalScore: bigint;
  settled: boolean;
  snapshotTaken: boolean;
  entryCount: bigint;
}

interface Lineup {
  captainPlayer: `0x${string}`;
  bestPlayer: `0x${string}`;
  rookiePlayer: `0x${string}`;
  hasSubmitted: boolean;
  claimed: boolean;
  score: bigint;
}

export function Lineups() {
  const { address, isConnected } = useAccount();
  const queryClient = useQueryClient();
  const [captainSelection, setCaptainSelection] = useState("");
  const [bestSelection, setBestSelection] = useState("");
  const [rookieSelection, setRookieSelection] = useState("");

  // Read round count
  const { data: roundCountData } = useReadContracts({
    contracts: [{
      address: CONTRACTS.lineupsGame,
      abi: lineupsGameAbi,
      functionName: "getRoundCount",
    }],
  });

  const roundCount = roundCountData?.[0]?.result ? Number(roundCountData[0].result as bigint) : 0;

  // Read all rounds
  const roundContracts = Array.from({ length: roundCount }, (_, i) => ({
    address: CONTRACTS.lineupsGame,
    abi: lineupsGameAbi,
    functionName: "rounds" as const,
    args: [BigInt(i + 1)] as const,
  }));

  const { data: roundsRaw } = useReadContracts({ contracts: roundContracts });

  // Read user lineups for all rounds
  const lineupContracts = address
    ? Array.from({ length: roundCount }, (_, i) => ({
        address: CONTRACTS.lineupsGame,
        abi: lineupsGameAbi,
        functionName: "getUserLineup" as const,
        args: [BigInt(i + 1), address] as const,
      }))
    : [];

  const { data: lineupsRaw } = useReadContracts({ contracts: lineupContracts });

  // Read user rewards
  const rewardContracts = address
    ? Array.from({ length: roundCount }, (_, i) => ({
        address: CONTRACTS.lineupsGame,
        abi: lineupsGameAbi,
        functionName: "getUserReward" as const,
        args: [BigInt(i + 1), address] as const,
      }))
    : [];

  const { data: rewardsRaw } = useReadContracts({ contracts: rewardContracts });

  const rounds: Round[] = (roundsRaw || [])
    .map((r, i) => {
      const d = r.result as [string, bigint, bigint, bigint, bigint, bigint, bigint, boolean, boolean, bigint] | undefined;
      if (!d) return null;
      return {
        id: i + 1,
        name: d[0],
        entryFee: d[1],
        lockTime: d[2],
        startTime: d[3],
        endTime: d[4],
        totalPool: d[5],
        totalScore: d[6],
        settled: d[7],
        snapshotTaken: d[8],
        entryCount: d[9],
      };
    })
    .filter((r): r is Round => r !== null);

  const lineups: (Lineup | null)[] = (lineupsRaw || []).map((r) => {
    const d = r.result as [`0x${string}`, `0x${string}`, `0x${string}`, boolean, boolean, bigint] | undefined;
    if (!d) return null;
    return {
      captainPlayer: d[0],
      bestPlayer: d[1],
      rookiePlayer: d[2],
      hasSubmitted: d[3],
      claimed: d[4],
      score: d[5],
    };
  });

  const rewards = (rewardsRaw || []).map((r) => (r.result as bigint) || 0n);

  const now = Math.floor(Date.now() / 1000);
  const activeRounds = rounds.filter((r) => Number(r.lockTime) > now && !r.settled);
  const pastRounds = rounds.filter((r) => r.settled || Number(r.endTime) < now);
  const currentRound = activeRounds[0];

  // Group players by role
  const captains = PLAYERS.filter((p) => p.role === 0);
  const bests = PLAYERS.filter((p) => p.role === 1);
  const rookies = PLAYERS.filter((p) => p.role === 2);

  // Wagmi writes
  const { writeContract: submitLineup, data: submitTx } = useWriteContract();
  const { writeContract: claimReward, data: claimTx } = useWriteContract();
  const { writeContract: approveFanovo, data: approveTx } = useWriteContract();

  const { isLoading: isSubmitting } = useWaitForTransactionReceipt({ hash: submitTx });
  const { isLoading: isClaiming } = useWaitForTransactionReceipt({ hash: claimTx });
  const { isLoading: isApproving } = useWaitForTransactionReceipt({ hash: approveTx });

  useEffect(() => {
    if (submitTx || claimTx || approveTx) {
      queryClient.invalidateQueries({ queryKey: ["readContract"] });
    }
  }, [submitTx, claimTx, approveTx, queryClient]);

  // Read FANOVO allowance
  const { data: fanovoAllowance } = useReadContracts({
    contracts: address && currentRound
      ? [{
          address: CONTRACTS.fanovoToken,
          abi: fanovoTokenAbi,
          functionName: "allowance",
          args: [address, CONTRACTS.lineupsGame],
        }]
      : [],
  });

  const needsApproval = currentRound
    ? (fanovoAllowance?.[0]?.result as bigint || 0n) < currentRound.entryFee
    : false;

  const handleApprove = () => {
    approveFanovo({
      address: CONTRACTS.fanovoToken,
      abi: fanovoTokenAbi,
      functionName: "approve",
      args: [CONTRACTS.lineupsGame, currentRound!.entryFee * 10n],
    });
  };

  const handleSubmit = () => {
    if (!currentRound || !captainSelection || !bestSelection || !rookieSelection) return;
    const captain = captains.find((p) => p.symbol === captainSelection);
    const best = bests.find((p) => p.symbol === bestSelection);
    const rookie = rookies.find((p) => p.symbol === rookieSelection);
    if (!captain || !best || !rookie) return;

    submitLineup({
      address: CONTRACTS.lineupsGame,
      abi: lineupsGameAbi,
      functionName: "submitLineup",
      args: [BigInt(currentRound.id), captainSelection as `0x${string}`, bestSelection as `0x${string}`, rookieSelection as `0x${string}`],
    });
  };

  const handleClaim = (roundId: number) => {
    claimReward({
      address: CONTRACTS.lineupsGame,
      abi: lineupsGameAbi,
      functionName: "claimReward",
      args: [BigInt(roundId)],
    });
  };

  if (roundCount === 0) {
    return (
      <div className="space-y-8">
        <div>
          <h1 className="text-3xl font-bold">Lineups</h1>
          <p className="text-sm text-[#888] mt-1">
            Lock FANOVO, pick CAPTAIN + BEST + ROOKIE. Rank by price performance. Top scorers split the pool.
          </p>
        </div>
        <div className="card p-12 text-center">
          <p className="text-lg text-[#888]">No active rounds yet</p>
          <p className="text-sm text-[#555] mt-2">Rounds will open once the tournament begins.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold">Lineups</h1>
        <p className="text-sm text-[#888] mt-1">
          Lock FANOVO, pick CAPTAIN, BEST, and ROOKIE. Rank by price performance during the round window. Top scorers split the pool.
        </p>
      </div>

      {/* Active Round */}
      {currentRound && (
        <div className="card p-6 space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-[10px] text-[#555] uppercase tracking-wider">Active Round</p>
              <h2 className="text-xl font-bold">{currentRound.name}</h2>
              <p className="text-xs text-[#555] mt-1">
                Locks {new Date(Number(currentRound.lockTime) * 1000).toLocaleString()}
              </p>
            </div>
            <span className="text-[10px] bg-[#34d399]/10 text-[#34d399] px-2 py-1 rounded font-semibold tracking-wider">OPEN</span>
          </div>

          <div className="flex gap-8 text-sm">
            <div>
              <p className="text-[10px] text-[#555] uppercase">Entry Fee</p>
              <p className="font-bold font-mono text-lg">{Number(formatEther(currentRound.entryFee)).toFixed(2)} <span className="text-xs text-[#555]">FANOVO</span></p>
            </div>
            <div>
              <p className="text-[10px] text-[#555] uppercase">Pool</p>
              <p className="font-bold font-mono text-lg">{Number(formatEther(currentRound.totalPool)).toFixed(2)} <span className="text-xs text-[#555]">FANOVO</span></p>
            </div>
            <div>
              <p className="text-[10px] text-[#555] uppercase">Entries</p>
              <p className="font-bold font-mono text-lg">{currentRound.entryCount.toString()}</p>
            </div>
          </div>

          {/* User lineup for this round */}
          {isConnected && lineups[currentRound.id - 1]?.hasSubmitted ? (
            <div className="border-t border-white/[0.06] pt-4">
              <p className="text-[10px] text-[#555] uppercase tracking-wider mb-3">Your Lineup</p>
              <div className="flex gap-3">
                <LineupSlot player={findPlayer(lineups[currentRound.id - 1]!.captainPlayer)} role="CAPTAIN" />
                <LineupSlot player={findPlayer(lineups[currentRound.id - 1]!.bestPlayer)} role="BEST" />
                <LineupSlot player={findPlayer(lineups[currentRound.id - 1]!.rookiePlayer)} role="ROOKIE" />
              </div>
            </div>
          ) : (
            <div className="border-t border-white/[0.06] pt-4 space-y-4">
              <p className="text-[10px] text-[#555] uppercase tracking-wider">Build Your Lineup</p>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                {/* Captain select */}
                <div className="space-y-2">
                  <label className="text-[10px] text-[#fbbf24] uppercase tracking-wider font-bold">Captain (2x score)</label>
                  <select
                    value={captainSelection}
                    onChange={(e) => setCaptainSelection(e.target.value)}
                    className="w-full bg-[#0d0d0d] border border-white/[0.08] rounded-lg px-3 py-2 text-sm text-white outline-none"
                  >
                    <option value="">Select Captain...</option>
                    {captains.map((p) => (
                      <option key={p.symbol} value={p.symbol}>
                        {p.name} ({COUNTRIES[p.countryId].symbol})
                      </option>
                    ))}
                  </select>
                </div>

                {/* Best select */}
                <div className="space-y-2">
                  <label className="text-[10px] text-[#60a5fa] uppercase tracking-wider font-bold">Best (1x score)</label>
                  <select
                    value={bestSelection}
                    onChange={(e) => setBestSelection(e.target.value)}
                    className="w-full bg-[#0d0d0d] border border-white/[0.08] rounded-lg px-3 py-2 text-sm text-white outline-none"
                  >
                    <option value="">Select Best...</option>
                    {bests.map((p) => (
                      <option key={p.symbol} value={p.symbol}>
                        {p.name} ({COUNTRIES[p.countryId].symbol})
                      </option>
                    ))}
                  </select>
                </div>

                {/* Rookie select */}
                <div className="space-y-2">
                  <label className="text-[10px] text-[#34d399] uppercase tracking-wider font-bold">Rookie (1x score)</label>
                  <select
                    value={rookieSelection}
                    onChange={(e) => setRookieSelection(e.target.value)}
                    className="w-full bg-[#0d0d0d] border border-white/[0.08] rounded-lg px-3 py-2 text-sm text-white outline-none"
                  >
                    <option value="">Select Rookie...</option>
                    {rookies.map((p) => (
                      <option key={p.symbol} value={p.symbol}>
                        {p.name} ({COUNTRIES[p.countryId].symbol})
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {needsApproval ? (
                <button
                  onClick={handleApprove}
                  disabled={isApproving}
                  className="w-full py-3 rounded-lg text-sm font-semibold bg-[#f59e0b] hover:bg-[#f59e0b]/80 text-white transition-colors"
                >
                  {isApproving ? "Approving..." : "Approve FANOVO"}
                </button>
              ) : (
                <button
                  onClick={handleSubmit}
                  disabled={isSubmitting || !captainSelection || !bestSelection || !rookieSelection}
                  className="w-full py-3 rounded-lg text-sm font-semibold bg-[#ff2d55] hover:bg-[#ff2d55]/80 text-white transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {isSubmitting ? "Submitting..." : `Lock Lineup · ${Number(formatEther(currentRound.entryFee)).toFixed(2)} FANOVO`}
                </button>
              )}
            </div>
          )}
        </div>
      )}

      {/* Past / Settled Rounds */}
      {pastRounds.length > 0 && (
        <div className="card overflow-hidden">
          <div className="p-5 border-b border-white/[0.06] flex items-center justify-between">
            <h3 className="font-bold">Past Rounds</h3>
          </div>

          <div className="flex items-center px-5 py-2 border-b border-white/[0.06] text-[10px] text-[#555] uppercase tracking-wider">
            <div className="flex-1">Round</div>
            <div className="w-24 text-right">Pool</div>
            <div className="w-24 text-right">Entries</div>
            <div className="w-24 text-right">Your Score</div>
            <div className="w-24 text-right">Reward</div>
            <div className="w-24 text-right">Action</div>
          </div>

          {pastRounds.map((round) => {
            const lineup = lineups[round.id - 1];
            const reward = rewards[round.id - 1];
            const canClaim = lineup?.hasSubmitted && !lineup.claimed && round.settled && (reward || 0n) > 0n;

            return (
              <div key={round.id} className="flex items-center px-5 py-3 border-b border-white/[0.03] hover:bg-white/[0.02] transition-colors">
                <div className="flex-1 text-sm font-medium">{round.name}</div>
                <div className="w-24 text-right font-mono text-sm">{Number(formatEther(round.totalPool)).toFixed(0)}</div>
                <div className="w-24 text-right font-mono text-sm">{round.entryCount.toString()}</div>
                <div className="w-24 text-right font-mono text-sm">{lineup?.hasSubmitted ? Number(lineup.score).toString() : "—"}</div>
                <div className="w-24 text-right font-mono text-sm">{reward ? Number(formatEther(reward)).toFixed(2) : "—"}</div>
                <div className="w-24 text-right">
                  {canClaim ? (
                    <button
                      onClick={() => handleClaim(round.id)}
                      disabled={isClaiming}
                      className="text-[10px] bg-[#34d399] hover:bg-[#34d399]/80 text-white px-3 py-1 rounded font-semibold"
                    >
                      {isClaiming ? "..." : "Claim"}
                    </button>
                  ) : lineup?.claimed ? (
                    <span className="text-[10px] text-[#34d399]">Claimed</span>
                  ) : (
                    <span className="text-[10px] text-[#555]">—</span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* How it works */}
      <div className="card p-6 space-y-3">
        <h3 className="font-bold">How it works</h3>
        <div className="text-sm text-[#888] space-y-2 leading-relaxed">
          <p>Each round you lock {currentRound ? Number(formatEther(currentRound.entryFee)).toFixed(2) : "1.0"} FANOVO. You pick one CAPTAIN and one BEST and one ROOKIE player.</p>
          <p>Your CAPTAIN earns 2× points. BEST and ROOKIE earn 1×. Points = price change of that player token during the round window.</p>
          <p>When the round ends, all entries are ranked by total score. Top scorers split the pool pro-rata.</p>
          <p>Your FANOVO deposit goes into the pool. Winners take all.</p>
        </div>
      </div>
    </div>
  );
}

function LineupSlot({ player, role }: { player: { name: string; countrySymbol: string; role: number } | null; role: string }) {
  if (!player) return <div className="flex-1 bg-[#161616] rounded-lg px-4 py-3 border border-white/[0.06] text-[#555] text-sm">Empty</div>;

  const roleColors: Record<string, string> = {
    CAPTAIN: "text-[#fbbf24]",
    BEST: "text-[#60a5fa]",
    ROOKIE: "text-[#34d399]",
  };

  return (
    <div className="flex-1 flex items-center gap-3 bg-[#161616] rounded-lg px-4 py-3 border border-white/[0.06]">
      <img src={getFlagUrl(player.countrySymbol)} alt="" className="w-6 h-4 rounded object-cover" />
      <div className="flex-1">
        <p className={`text-[9px] font-bold uppercase leading-none mb-0.5 ${roleColors[role] || "text-[#555]"}`}>{role}</p>
        <p className="text-sm font-medium">{player.name}</p>
      </div>
    </div>
  );
}

function findPlayer(addr: `0x${string}`): { name: string; countrySymbol: string; role: number } | null {
  // We can't easily map address → player without on-chain lookup.
  // In production you'd query playerHook.getPlayer(countryId, role) or maintain a mapping.
  // For now return a placeholder.
  return { name: addr.slice(0, 6) + "..." + addr.slice(-4), countrySymbol: "USA", role: 0 };
}
