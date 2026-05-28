"use client";

import { useState, useEffect } from "react";
import { useReadContracts, useAccount, useWriteContract, useWaitForTransactionReceipt } from "wagmi";
import { formatEther, parseEther } from "viem";
import { useQueryClient } from "@tanstack/react-query";
import { CONTRACTS, COUNTRIES, getFlagUrl } from "@/lib/contracts";
import { packOpenerAbi, predictionMarketHubAbi, fanovoTokenAbi } from "@/lib/abi";

const MATCHES = [
  // MATCHDAY 1
  { group: "A", day: "Thursday, June 11", time: "00:00", home: 0, away: 2 },
  { group: "A", day: "Friday, June 12", time: "07:00", home: 1, away: 3 },
  { group: "B", day: "Friday, June 12", time: "00:00", home: 4, away: 7 },
  { group: "B", day: "Saturday, June 13", time: "00:00", home: 5, away: 6 },
  { group: "D", day: "Saturday, June 13", time: "06:00", home: 12, away: 15 },
  { group: "C", day: "Sunday, June 14", time: "03:00", home: 8, away: 9 },
  { group: "C", day: "Sunday, June 14", time: "06:00", home: 11, away: 10 },
  { group: "D", day: "Sunday, June 14", time: "09:00", home: 14, away: 13 },
  { group: "E", day: "Sunday, June 14", time: "22:00", home: 16, away: 17 },
  { group: "F", day: "Sunday, June 14", time: "01:00", home: 20, away: 21 },
  { group: "E", day: "Monday, June 15", time: "04:00", home: 18, away: 19 },
  { group: "F", day: "Monday, June 15", time: "07:00", home: 22, away: 23 },
  { group: "H", day: "Monday, June 15", time: "21:00", home: 28, away: 30 },
  { group: "G", day: "Monday, June 15", time: "00:00", home: 24, away: 25 },
  { group: "H", day: "Tuesday, June 16", time: "03:00", home: 29, away: 31 },
  { group: "G", day: "Tuesday, June 16", time: "06:00", home: 26, away: 27 },
  { group: "I", day: "Tuesday, June 16", time: "00:00", home: 32, away: 33 },
  { group: "I", day: "Wednesday, June 17", time: "03:00", home: 35, away: 34 },
  { group: "J", day: "Wednesday, June 17", time: "06:00", home: 36, away: 37 },
  { group: "J", day: "Wednesday, June 17", time: "09:00", home: 38, away: 39 },
  { group: "K", day: "Wednesday, June 17", time: "22:00", home: 40, away: 43 },
  { group: "L", day: "Wednesday, June 17", time: "01:00", home: 44, away: 45 },
  { group: "L", day: "Thursday, June 18", time: "04:00", home: 47, away: 46 },
  { group: "K", day: "Thursday, June 18", time: "07:00", home: 42, away: 41 },
  // MATCHDAY 2
  { group: "A", day: "Thursday, June 18", time: "21:00", home: 3, away: 2 },
  { group: "B", day: "Thursday, June 18", time: "00:00", home: 6, away: 7 },
  { group: "B", day: "Friday, June 19", time: "03:00", home: 4, away: 5 },
  { group: "A", day: "Friday, June 19", time: "06:00", home: 0, away: 1 },
  { group: "D", day: "Friday, June 19", time: "00:00", home: 12, away: 14 },
  { group: "C", day: "Saturday, June 20", time: "03:00", home: 10, away: 9 },
  { group: "C", day: "Saturday, June 20", time: "05:30", home: 8, away: 11 },
  { group: "D", day: "Saturday, June 20", time: "08:00", home: 13, away: 15 },
  { group: "F", day: "Saturday, June 20", time: "22:00", home: 20, away: 22 },
  { group: "E", day: "Saturday, June 20", time: "01:00", home: 16, away: 18 },
  { group: "E", day: "Sunday, June 21", time: "05:00", home: 19, away: 17 },
  { group: "F", day: "Sunday, June 21", time: "09:00", home: 23, away: 21 },
  { group: "H", day: "Sunday, June 21", time: "21:00", home: 28, away: 29 },
  { group: "G", day: "Sunday, June 21", time: "00:00", home: 24, away: 26 },
  { group: "H", day: "Monday, June 22", time: "03:00", home: 31, away: 30 },
  { group: "G", day: "Monday, June 22", time: "06:00", home: 27, away: 25 },
  { group: "J", day: "Monday, June 22", time: "22:00", home: 36, away: 38 },
  { group: "I", day: "Monday, June 22", time: "02:00", home: 32, away: 35 },
  { group: "I", day: "Tuesday, June 23", time: "05:00", home: 34, away: 33 },
  { group: "J", day: "Tuesday, June 23", time: "08:00", home: 39, away: 37 },
  { group: "K", day: "Tuesday, June 23", time: "22:00", home: 40, away: 42 },
  { group: "L", day: "Tuesday, June 23", time: "01:00", home: 44, away: 47 },
  { group: "L", day: "Wednesday, June 24", time: "04:00", home: 46, away: 45 },
  { group: "K", day: "Wednesday, June 24", time: "07:00", home: 41, away: 43 },
  // MATCHDAY 3
  { group: "B", day: "Wednesday, June 24", time: "00:00", home: 6, away: 4 },
  { group: "B", day: "Wednesday, June 24", time: "00:00", home: 7, away: 5 },
  { group: "C", day: "Thursday, June 25", time: "03:00", home: 9, away: 11 },
  { group: "C", day: "Thursday, June 25", time: "03:00", home: 10, away: 8 },
  { group: "A", day: "Thursday, June 25", time: "06:00", home: 2, away: 1 },
  { group: "A", day: "Thursday, June 25", time: "06:00", home: 3, away: 0 },
  { group: "E", day: "Thursday, June 25", time: "01:00", home: 17, away: 18 },
  { group: "E", day: "Thursday, June 25", time: "01:00", home: 19, away: 16 },
  { group: "F", day: "Friday, June 26", time: "04:00", home: 23, away: 20 },
  { group: "F", day: "Friday, June 26", time: "04:00", home: 21, away: 22 },
  { group: "D", day: "Friday, June 26", time: "07:00", home: 13, away: 12 },
  { group: "D", day: "Friday, June 26", time: "07:00", home: 15, away: 14 },
  { group: "I", day: "Friday, June 26", time: "00:00", home: 34, away: 32 },
  { group: "I", day: "Friday, June 26", time: "00:00", home: 33, away: 35 },
  { group: "H", day: "Saturday, June 27", time: "05:00", home: 30, away: 29 },
  { group: "H", day: "Saturday, June 27", time: "05:00", home: 31, away: 28 },
  { group: "G", day: "Saturday, June 27", time: "08:00", home: 27, away: 24 },
  { group: "G", day: "Saturday, June 27", time: "08:00", home: 25, away: 26 },
  { group: "L", day: "Saturday, June 27", time: "02:00", home: 46, away: 44 },
  { group: "L", day: "Saturday, June 27", time: "02:00", home: 45, away: 47 },
  { group: "K", day: "Sunday, June 28", time: "04:30", home: 41, away: 40 },
  { group: "K", day: "Sunday, June 28", time: "04:30", home: 43, away: 42 },
  { group: "J", day: "Sunday, June 28", time: "07:00", home: 37, away: 38 },
  { group: "J", day: "Sunday, June 28", time: "07:00", home: 36, away: 39 },
];

export function Predict() {
  const [selectedMatch, setSelectedMatch] = useState<(typeof MATCHES)[0] | null>(null);
  const [betSide, setBetSide] = useState<"home" | "draw" | "away">("home");
  const [showWinnerModal, setShowWinnerModal] = useState(false);
  const [betAmount, setBetAmount] = useState("");
  const { address, isConnected } = useAccount();
  const queryClient = useQueryClient();

  const matchId = selectedMatch ? MATCHES.indexOf(selectedMatch) + 1 : 0;

  const { data: prices } = useReadContracts({
    contracts: COUNTRIES.map((country) => ({
      address: CONTRACTS.packOpener,
      abi: packOpenerAbi,
      functionName: "getPrice" as const,
      args: [BigInt(country.id)] as const,
    })),
  });

  // Read on-chain match data
  const { data: chainMatch } = useReadContracts({
    contracts: matchId > 0 ? [{
      address: CONTRACTS.predictionMarketHub,
      abi: predictionMarketHubAbi,
      functionName: "getMatch" as const,
      args: [BigInt(matchId)] as const,
    }] : [],
  });

  // Read user stakes for selected match
  const { data: userStakes } = useReadContracts({
    contracts: matchId > 0 && address ? [{
      address: CONTRACTS.predictionMarketHub,
      abi: predictionMarketHubAbi,
      functionName: "getUserStakes" as const,
      args: [BigInt(matchId), address] as const,
    }] : [],
  });

  // Read if user claimed
  const { data: userClaimed } = useReadContracts({
    contracts: matchId > 0 && address ? [{
      address: CONTRACTS.predictionMarketHub,
      abi: predictionMarketHubAbi,
      functionName: "claimed" as const,
      args: [BigInt(matchId), address] as const,
    }] : [],
  });

  // Read FANOVO balance & allowance
  const { data: fanovoData } = useReadContracts({
    contracts: address ? [
      {
        address: CONTRACTS.fanovoToken,
        abi: fanovoTokenAbi,
        functionName: "balanceOf",
        args: [address],
      },
      {
        address: CONTRACTS.fanovoToken,
        abi: fanovoTokenAbi,
        functionName: "allowance",
        args: [address, CONTRACTS.predictionMarketHub],
      },
    ] : [],
  });

  const fanovoBalance = fanovoData?.[0]?.result ? Number(formatEther(fanovoData[0].result as bigint)) : 0;
  const fanovoAllowance = fanovoData?.[1]?.result ? Number(formatEther(fanovoData[1].result as bigint)) : 0;

  const hasChainMatch = chainMatch?.[0]?.result !== undefined;
  const matchResult = chainMatch?.[0]?.result as [number, number, bigint, bigint, number, bigint, bigint, bigint, boolean, boolean, string] | undefined;
  const matchSettled = matchResult?.[8] || false;
  const matchOutcome = matchResult?.[4] ?? 0;

  const stakes = userStakes?.[0]?.result as [bigint, bigint, bigint] | undefined;
  const stakedHome = stakes ? Number(formatEther(stakes[0])) : 0;
  const stakedDraw = stakes ? Number(formatEther(stakes[1])) : 0;
  const stakedAway = stakes ? Number(formatEther(stakes[2])) : 0;
  const totalStaked = stakedHome + stakedDraw + stakedAway;
  const hasClaimed = userClaimed?.[0]?.result as boolean || false;

  const getPrice = (id: number) => {
    const p = prices?.[id]?.result;
    return p ? Number(formatEther(p as bigint)) : 0;
  };

  const totalAllPrices = COUNTRIES.reduce((s, _, i) => s + getPrice(i), 0);

  const getProbs = (homeId: number, awayId: number) => {
    const hp = getPrice(homeId);
    const ap = getPrice(awayId);
    const total = hp + ap;
    const homeWin = Math.round((hp / total) * 73);
    const awayWin = Math.round((ap / total) * 73);
    const draw = 100 - homeWin - awayWin;
    return { home: homeWin, draw, away: awayWin };
  };

  // Group matches by day
  const days = [...new Set(MATCHES.map((m) => m.day))];

  // Top winners
  const topWinners = [...COUNTRIES]
    .map((c, i) => ({ ...c, price: getPrice(i), pct: ((getPrice(i) / totalAllPrices) * 100).toFixed(1) }))
    .sort((a, b) => b.price - a.price)
    .slice(0, 3);

  // Wagmi writes
  const { writeContract: approve, data: approveTx } = useWriteContract();
  const { writeContract: stake, data: stakeTx } = useWriteContract();
  const { writeContract: claim, data: claimTx } = useWriteContract();

  const { isLoading: isApproving } = useWaitForTransactionReceipt({ hash: approveTx });
  const { isLoading: isStaking } = useWaitForTransactionReceipt({ hash: stakeTx });
  const { isLoading: isClaiming } = useWaitForTransactionReceipt({ hash: claimTx });

  useEffect(() => {
    if (approveTx || stakeTx || claimTx) {
      queryClient.invalidateQueries({ queryKey: ["readContract"] });
    }
  }, [approveTx, stakeTx, claimTx, queryClient]);

  const needsApproval = fanovoAllowance < (Number(betAmount) || 0);

  const handleApprove = () => {
    approve({
      address: CONTRACTS.fanovoToken,
      abi: fanovoTokenAbi,
      functionName: "approve",
      args: [CONTRACTS.predictionMarketHub, parseEther("100000")],
    });
  };

  const handleStake = () => {
    if (!betAmount || Number(betAmount) <= 0) return;
    const side = betSide === "home" ? 0 : betSide === "draw" ? 1 : 2;
    stake({
      address: CONTRACTS.predictionMarketHub,
      abi: predictionMarketHubAbi,
      functionName: "stake",
      args: [BigInt(matchId), side, parseEther(betAmount)],
    });
  };

  const handleClaim = () => {
    claim({
      address: CONTRACTS.predictionMarketHub,
      abi: predictionMarketHubAbi,
      functionName: "claim",
      args: [BigInt(matchId)],
    });
  };

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-bold">Predict</h1>
        <p className="text-sm text-[#888] mt-1">
          Implied prediction markets derived from on-chain country prices.
        </p>
      </div>

      {/* World Cup Winner */}
      <div className="card p-6 cursor-pointer hover:border-white/[0.15] transition-colors" onClick={() => setShowWinnerModal(true)}>
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <span className="text-2xl">🏆</span>
            <div>
              <p className="font-bold">2026 FIFA World Cup Winner</p>
              <p className="text-xs text-[#555]">48 outcomes – tap to view full market</p>
            </div>
          </div>
          <div className="text-right">
            <p className="text-xl font-bold font-mono">{totalAllPrices.toFixed(1)} <span className="text-xs text-[#555]">FANOVO</span></p>
            <p className="text-xs text-[#555]">total market</p>
          </div>
        </div>
        <div className="flex items-center gap-4">
          {topWinners.map((c) => (
            <div key={c.id} className="flex items-center gap-2">
              <img src={getFlagUrl(c.symbol)} alt="" className="w-6 h-4 rounded object-cover" />
              <span className="text-sm font-medium">{c.name}</span>
              <span className="text-xs text-[#34d399]">{c.pct}%</span>
            </div>
          ))}
        </div>
      </div>

      {/* Games by day */}
      <div className="space-y-6">
        <p className="text-[10px] text-[#555] uppercase tracking-widest">Games</p>

        {days.map((day) => {
          const dayMatches = MATCHES.filter((m) => m.day === day);
          return (
            <div key={day} className="space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="font-bold text-sm">{day}</h3>
                <span className="text-xs text-[#555]">{dayMatches.length} match{dayMatches.length > 1 ? "es" : ""}</span>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {dayMatches.map((match, i) => {
                  const home = COUNTRIES[match.home];
                  const away = COUNTRIES[match.away];
                  const probs = getProbs(match.home, match.away);
                  const homeReserve = getPrice(match.home);
                  const awayReserve = getPrice(match.away);
                  const pool = homeReserve + awayReserve;

                  return (
                    <div key={i} className="card p-4 space-y-3 cursor-pointer hover:border-white/[0.15] transition-colors" onClick={() => { setSelectedMatch(match); setBetSide("home"); setBetAmount(""); }}>
                      {/* Header */}
                      <div className="flex items-center justify-between text-[10px] text-[#555]">
                        <span>GROUP {match.group} • MATCHDAY 1</span>
                        <span>{match.time} UTC</span>
                      </div>

                      {/* Teams */}
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <img src={getFlagUrl(home.symbol)} alt="" className="w-7 h-5 rounded object-cover" />
                          <span className="text-sm font-semibold">{home.name}</span>
                        </div>
                        <div className="text-center px-3">
                          <p className="text-[10px] text-[#555]">VS</p>
                          <p className="text-[10px] text-[#555]">Draw {probs.draw}%</p>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-semibold">{away.name}</span>
                          <img src={getFlagUrl(away.symbol)} alt="" className="w-7 h-5 rounded object-cover" />
                        </div>
                      </div>

                      {/* Probabilities */}
                      <div className="flex items-center justify-between text-xs">
                        <span className="text-[#34d399] font-mono">{probs.home}%</span>
                        <span className="text-[#ff2d55] font-mono">{probs.away}%</span>
                      </div>

                      {/* Progress bar */}
                      <div className="flex h-1 rounded-full overflow-hidden">
                        <div className="bg-[#34d399]" style={{ width: `${probs.home}%` }} />
                        <div className="bg-[#555]" style={{ width: `${probs.draw}%` }} />
                        <div className="bg-[#ff2d55]" style={{ width: `${probs.away}%` }} />
                      </div>

                      {/* Pool */}
                      <div className="flex items-center justify-between text-[10px] text-[#555]">
                        <span>Pool</span>
                        <span className="font-mono">{pool.toFixed(4)} FANOVO</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>

      {/* Winner Modal */}
      {showWinnerModal && (
        <div className="fixed inset-0 z-[100] bg-black/80 backdrop-blur-sm flex items-center justify-center p-4" onClick={() => setShowWinnerModal(false)}>
          <div className="card w-full max-w-lg max-h-[80vh] flex flex-col" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between p-6 pb-3 border-b border-white/[0.06] shrink-0">
              <div className="flex items-center gap-3">
                <span className="text-xl">🏆</span>
                <div>
                  <p className="font-bold">2026 FIFA World Cup Winner</p>
                  <p className="text-xs text-[#555]">48 outcomes – implied from curve prices</p>
                </div>
              </div>
              <button onClick={() => setShowWinnerModal(false)} className="text-[#555] hover:text-white text-lg">✕</button>
            </div>

            <div className="overflow-y-auto p-6 pt-3 space-y-2">
              {[...COUNTRIES]
                .map((c, i) => ({ ...c, price: getPrice(i), pct: (getPrice(i) / totalAllPrices) * 100 }))
                .sort((a, b) => b.pct - a.pct)
                .map((c, rank) => (
                  <div key={c.id} className="flex items-center py-2">
                    <div className="flex items-center gap-3 flex-1">
                      <img src={getFlagUrl(c.symbol)} alt="" className="w-8 h-5 rounded object-cover" />
                      <div>
                        <p className="text-sm font-medium">{c.name}</p>
                        <p className="text-[10px] text-[#555]">{c.symbol} • #{rank + 1} favourite</p>
                      </div>
                    </div>
                    <div className="text-right mr-4">
                      <p className="text-xl font-bold font-mono">{c.pct.toFixed(2)}%</p>
                      <p className="text-[10px] text-[#555]">of total market</p>
                    </div>
                    <a href={`/trade/${c.id}`} className="btn-trade text-[10px] px-3 py-1.5">BUY {c.symbol}</a>
                  </div>
                ))}
            </div>
          </div>
        </div>
      )}

      {/* Match Modal */}
      {selectedMatch && (() => {
        const home = COUNTRIES[selectedMatch.home];
        const away = COUNTRIES[selectedMatch.away];
        const probs = getProbs(selectedMatch.home, selectedMatch.away);
        const pool = getPrice(selectedMatch.home) + getPrice(selectedMatch.away);

        const isWinner = matchSettled && (
          (matchOutcome === 0 && betSide === "home") ||
          (matchOutcome === 1 && betSide === "draw") ||
          (matchOutcome === 2 && betSide === "away")
        );

        return (
          <div className="fixed inset-0 z-[100] bg-black/80 backdrop-blur-sm flex items-center justify-center p-4" onClick={() => setSelectedMatch(null)}>
            <div className="card p-6 w-full max-w-md space-y-5" onClick={(e) => e.stopPropagation()}>
              {/* Header */}
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <img src={getFlagUrl(home.symbol)} alt="" className="w-6 h-4 rounded object-cover" />
                  <span className="font-semibold text-sm">{home.name}</span>
                  <span className="text-[#555] text-xs">vs</span>
                  <span className="font-semibold text-sm">{away.name}</span>
                  <img src={getFlagUrl(away.symbol)} alt="" className="w-6 h-4 rounded object-cover" />
                </div>
                <button onClick={() => setSelectedMatch(null)} className="text-[#555] hover:text-white text-lg">✕</button>
              </div>

              <p className="text-xs text-[#555]">Group {selectedMatch.group} • Matchday 1 • {selectedMatch.time} UTC</p>

              {/* Pool */}
              <div className="flex items-center justify-between">
                <p className="text-xs text-[#555]">POOL • ORACLE TAKES ALL, PRO RATA</p>
                <p className="font-bold font-mono">{pool.toFixed(4)} FANOVO</p>
              </div>

              {/* Your stakes */}
              {isConnected && totalStaked > 0 && (
                <div className="bg-[#161616] rounded-lg p-3 text-xs space-y-1">
                  <p className="text-[#555] uppercase tracking-wider">Your Stakes</p>
                  <div className="flex justify-between">
                    <span>{home.symbol} (Home)</span>
                    <span className="font-mono">{stakedHome.toFixed(2)} FANOVO</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Draw</span>
                    <span className="font-mono">{stakedDraw.toFixed(2)} FANOVO</span>
                  </div>
                  <div className="flex justify-between">
                    <span>{away.symbol} (Away)</span>
                    <span className="font-mono">{stakedAway.toFixed(2)} FANOVO</span>
                  </div>
                </div>
              )}

              {/* Three outcomes */}
              <div className="grid grid-cols-3 gap-2">
                <button onClick={() => setBetSide("home")} className={`p-3 rounded-lg border text-left transition-colors ${betSide === "home" ? "border-[#ff2d55] bg-[#ff2d55]/5" : "border-white/[0.08] hover:border-white/[0.15]"}`}>
                  <p className="text-[10px] text-[#555] uppercase">Buy wins</p>
                  <p className="font-bold text-sm">{home.name}</p>
                  <p className="text-lg font-bold text-[#34d399]">{probs.home}%</p>
                  <p className="text-[10px] text-[#555]">Pct. {(probs.home / 100 * pool).toFixed(4)} FANOVO</p>
                </button>
                <button onClick={() => setBetSide("draw")} className={`p-3 rounded-lg border text-left transition-colors ${betSide === "draw" ? "border-[#ff2d55] bg-[#ff2d55]/5" : "border-white/[0.08] hover:border-white/[0.15]"}`}>
                  <p className="text-[10px] text-[#555] uppercase">Draw pays most</p>
                  <p className="font-bold text-sm">Draw</p>
                  <p className="text-lg font-bold">{probs.draw}%</p>
                  <p className="text-[10px] text-[#555]">Pct. {(probs.draw / 100 * pool).toFixed(4)} FANOVO</p>
                </button>
                <button onClick={() => setBetSide("away")} className={`p-3 rounded-lg border text-left transition-colors ${betSide === "away" ? "border-[#ff2d55] bg-[#ff2d55]/5" : "border-white/[0.08] hover:border-white/[0.15]"}`}>
                  <p className="text-[10px] text-[#555] uppercase">Buy wins</p>
                  <p className="font-bold text-sm">{away.name}</p>
                  <p className="text-lg font-bold text-[#ff2d55]">{probs.away}%</p>
                  <p className="text-[10px] text-[#555]">Pct. {(probs.away / 100 * pool).toFixed(4)} FANOVO</p>
                </button>
              </div>

              {/* Stake / Claim UI */}
              {matchSettled ? (
                <div className="space-y-3">
                  {isWinner && !hasClaimed ? (
                    <button
                      onClick={handleClaim}
                      disabled={isClaiming}
                      className="w-full py-3.5 bg-[#34d399] hover:bg-[#34d399]/80 text-white font-semibold rounded-lg transition-colors"
                    >
                      {isClaiming ? "Claiming..." : "Claim Winnings"}
                    </button>
                  ) : hasClaimed ? (
                    <button disabled className="w-full py-3.5 bg-[#161616] text-[#555] font-semibold rounded-lg cursor-not-allowed">
                      Already Claimed
                    </button>
                  ) : (
                    <button disabled className="w-full py-3.5 bg-[#161616] text-[#555] font-semibold rounded-lg cursor-not-allowed">
                      Match Settled – You Lost
                    </button>
                  )}
                </div>
              ) : hasChainMatch ? (
                <div className="space-y-3">
                  <p className="text-[10px] text-[#555] uppercase tracking-wider mb-2">
                    Stake FANOVO on {betSide === "home" ? home.name : betSide === "away" ? away.name : "Draw"}
                  </p>
                  <div className="flex gap-2">
                    <input
                      type="number"
                      placeholder="0.00"
                      value={betAmount}
                      onChange={(e) => setBetAmount(e.target.value)}
                      className="flex-1 bg-[#0d0d0d] border border-white/[0.08] rounded-lg px-4 py-2.5 text-sm font-mono text-white placeholder-[#333] outline-none"
                    />
                    {needsApproval ? (
                      <button
                        onClick={handleApprove}
                        disabled={isApproving}
                        className="btn-primary px-6"
                      >
                        {isApproving ? "Approving..." : "Approve"}
                      </button>
                    ) : (
                      <button
                        onClick={handleStake}
                        disabled={isStaking || !betAmount || Number(betAmount) <= 0 || Number(betAmount) > fanovoBalance}
                        className="btn-primary px-6 disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        {isStaking ? "Staking..." : "Stake"}
                      </button>
                    )}
                  </div>
                  <div className="flex items-center justify-between mt-2 text-[10px] text-[#555]">
                    <span>Balance: {isConnected ? fanovoBalance.toFixed(2) : "Connect wallet"} FANOVO</span>
                    <span>≈ 1% slippage</span>
                  </div>
                </div>
              ) : (
                <div className="text-center py-4 bg-[#161616] rounded-lg">
                  <p className="text-sm text-[#888]">Market not yet opened</p>
                  <p className="text-xs text-[#555] mt-1">Check back closer to match day</p>
                </div>
              )}

              <p className="text-[11px] text-[#555] leading-relaxed">
                Under the hood, you&apos;re staking FANOVO on the outcome. Winners split the pool pro-rata based on their stake.
              </p>

              <a href={`/trade/${betSide === "home" ? selectedMatch.home : selectedMatch.away}`} className="text-xs text-[#ff2d55] hover:underline">
                Advanced trading →
              </a>
            </div>
          </div>
        );
      })()}
    </div>
  );
}
