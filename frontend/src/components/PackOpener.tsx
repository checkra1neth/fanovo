"use client";

import { useState, useEffect } from "react";
import { useAccount, useReadContract, useReadContracts, useWriteContract, useWaitForTransactionReceipt, useBlockNumber } from "wagmi";
import { formatEther, parseEther, decodeEventLog } from "viem";
import { useQueryClient } from "@tanstack/react-query";
import { CONTRACTS, COUNTRIES, getFlagUrl } from "@/lib/contracts";
import { packOpenerAbi, worldCupHookAbi, fanovoTokenAbi } from "@/lib/abi";

export function PackOpener() {
  const { address, isConnected } = useAccount();
  const [revealedCountries, setRevealedCountries] = useState<number[]>([]);
  const [packCount, setPackCount] = useState(1);

  const { data: blockNumber } = useBlockNumber({ watch: true });

  const { data: fanovoBalance } = useReadContract({
    address: CONTRACTS.fanovoToken,
    abi: fanovoTokenAbi,
    functionName: "balanceOf",
    args: address ? [address] : undefined,
  });

  const { data: allowance, isLoading: isAllowanceLoading } = useReadContract({
    address: CONTRACTS.fanovoToken,
    abi: fanovoTokenAbi,
    functionName: "allowance",
    args: address ? [address, CONTRACTS.packOpener] : undefined,
  });

  const { data: isClosed } = useReadContract({
    address: CONTRACTS.packOpener,
    abi: packOpenerAbi,
    functionName: "isClosed",
  });

  const { data: packsOpened } = useReadContract({
    address: CONTRACTS.packOpener,
    abi: packOpenerAbi,
    functionName: "totalPacksOpened",
  });

  const { data: maxPacks } = useReadContract({
    address: CONTRACTS.packOpener,
    abi: packOpenerAbi,
    functionName: "MAX_PACKS",
  });

  const { data: delayBlocks } = useReadContract({
    address: CONTRACTS.packOpener,
    abi: packOpenerAbi,
    functionName: "DELAY_BLOCKS",
  });

  const { data: commitData } = useReadContract({
    address: CONTRACTS.packOpener,
    abi: packOpenerAbi,
    functionName: "commits",
    args: address ? [address] : undefined,
  });

  const { writeContract: approve, data: approveTx } = useWriteContract();
  const { writeContract: commit, data: commitTx } = useWriteContract();
  const { writeContract: reveal, data: revealTx } = useWriteContract();
  const { writeContract: recover, data: recoverTx } = useWriteContract();

  const { isLoading: isApproving, data: approveReceipt } = useWaitForTransactionReceipt({ hash: approveTx });
  const { isLoading: isCommitPending, data: commitReceipt } = useWaitForTransactionReceipt({ hash: commitTx });
  const { isLoading: isRevealPending, data: revealReceipt } = useWaitForTransactionReceipt({ hash: revealTx });
  const { data: recoverReceipt } = useWaitForTransactionReceipt({ hash: recoverTx });

  const queryClient = useQueryClient();

  // Parse commit data: [count, revealBlock, timestamp, revealed, exists]
  const hasCommit = commitData ? (commitData as [number, bigint, bigint, boolean, boolean])[4] : false;
  const commitCount = commitData ? (commitData as [number, bigint, bigint, boolean, boolean])[0] : 0;
  const commitRevealBlock = commitData ? (commitData as [number, bigint, bigint, boolean, boolean])[1] : 0n;
  const commitRevealed = commitData ? (commitData as [number, bigint, bigint, boolean, boolean])[3] : false;

  const blocksRemaining = blockNumber && commitRevealBlock > 0n
    ? Math.max(0, Number(commitRevealBlock) - Number(blockNumber))
    : 0;
  const canReveal = hasCommit && !commitRevealed && blocksRemaining === 0;

  // Invalidate after transactions
  useEffect(() => {
    if (approveReceipt?.status === "success" || commitReceipt?.status === "success" || revealReceipt?.status === "success" || recoverReceipt?.status === "success") {
      queryClient.invalidateQueries({ queryKey: ["readContract"] });
    }
  }, [approveReceipt, commitReceipt, revealReceipt, recoverReceipt, queryClient]);

  // Decode reveal events
  useEffect(() => {
    if (revealReceipt && revealReceipt.status === "success") {
      try {
        const revealed: number[] = [];
        for (const log of revealReceipt.logs) {
          try {
            const decoded = decodeEventLog({
              abi: packOpenerAbi,
              data: log.data,
              topics: log.topics,
            });
            if (decoded.eventName === "PackRevealed") {
              const args = decoded.args as unknown as { country: string; packNum: bigint };
              // Find country index by address
              // This is simplified - in production you'd query the country address
              revealed.push(Number(args.packNum));
            }
          } catch {
            // ignore
          }
        }
        if (revealed.length > 0) {
          setRevealedCountries(revealed);
          queryClient.invalidateQueries();
        }
      } catch {
        // ignore
      }
    }
  }, [revealReceipt, queryClient]);

  const needsApproval = !isAllowanceLoading && allowance !== undefined && allowance < parseEther((packCount + 10).toString());
  const hasBalance = fanovoBalance !== undefined && fanovoBalance >= parseEther(packCount.toString());
  const packs = packsOpened ? Number(packsOpened) : 0;
  const maxPackNum = maxPacks ? Number(maxPacks) : 0;
  const remaining = maxPackNum > 0 ? maxPackNum - packs : 0;
  const progress = maxPackNum > 0 ? (packs / maxPackNum) * 100 : 0;

  const handleApprove = () => {
    approve({
      address: CONTRACTS.fanovoToken,
      abi: fanovoTokenAbi,
      functionName: "approve",
      args: [CONTRACTS.packOpener, parseEther("100000")],
    });
  };

  const handleCommit = () => {
    setRevealedCountries([]);
    commit({
      address: CONTRACTS.packOpener,
      abi: packOpenerAbi,
      functionName: "commit",
      args: [packCount],
    });
  };

  const handleReveal = () => {
    reveal({
      address: CONTRACTS.packOpener,
      abi: packOpenerAbi,
      functionName: "reveal",
    });
  };

  const handleRecover = () => {
    recover({
      address: CONTRACTS.packOpener,
      abi: packOpenerAbi,
      functionName: "recoverStuckCommit",
    });
  };

  return (
    <div className="space-y-8">
      {/* Page header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Open Packs</h1>
          <p className="text-sm text-[#888] mt-1">
            Commit FANOVO, wait 10 blocks, then reveal to get random countries.
          </p>
        </div>
        <div className="text-right">
          <p className="text-xs text-[#555] uppercase tracking-wider">Remaining</p>
          <p className="text-2xl font-bold font-mono">
            {remaining.toLocaleString()}
            <span className="text-sm text-[#555]"> / {maxPackNum > 0 ? maxPackNum.toLocaleString() : "—"}</span>
          </p>
        </div>
      </div>

      {/* Status banner */}
      {!isClosed && (
        <div className="bg-[#34d399]/10 border border-[#34d399]/30 rounded-lg px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="text-xs text-[#34d399] uppercase font-semibold tracking-wider">Pack window is open</span>
            <span className="text-xs text-[#888]">
              — {remaining.toLocaleString()} packs left. Commit-reveal with 10-block delay.
            </span>
          </div>
          {isConnected && (
            <span className="text-xs text-[#888] font-mono">
              {fanovoBalance ? Number(formatEther(fanovoBalance)).toFixed(0) : "0"} FANOVO available
            </span>
          )}
        </div>
      )}

      {/* Main content */}
      <div className="flex gap-6 flex-col lg:flex-row">
        {/* Pack card */}
        <div className="flex-1 card p-0 overflow-hidden">
          {/* Progress bar */}
          <div className="h-2 bg-[#161616]">
            <div
              className="h-full bg-gradient-to-r from-[#ff2d55] to-[#ff6b8a] transition-all duration-500 rounded-r"
              style={{ width: `${Math.max(progress, 1)}%` }}
            />
          </div>

          {/* Content */}
          <div className="p-10 flex flex-col items-center justify-center min-h-[380px]">
            {isCommitPending ? (
              <div className="text-center">
                <div className="pack-card pack-shake mx-auto mb-8">
                  <div className="pack-card-top" />
                  <div className="pack-card-body">
                    <span className="text-4xl">?</span>
                  </div>
                  <div className="pack-card-bottom" />
                </div>
                <p className="text-xs text-[#555] uppercase tracking-wider">Committing</p>
                <p className="text-sm text-[#888] mt-1">Locking {packCount} FANOVO on-chain...</p>
              </div>
            ) : isRevealPending ? (
              <div className="text-center">
                <div className="pack-card pack-shake mx-auto mb-8">
                  <div className="pack-card-top bg-gradient-to-r from-[#ff2d55] to-[#ff6b8a]" />
                  <div className="pack-card-body">
                    <span className="text-4xl">🎁</span>
                  </div>
                  <div className="pack-card-bottom" />
                </div>
                <p className="text-xs text-[#555] uppercase tracking-wider">Revealing</p>
                <p className="text-sm text-[#888] mt-1">Unpacking {commitCount} countries...</p>
              </div>
            ) : revealedCountries.length > 0 ? (
              <div className="text-center pack-reveal">
                <div className="pack-card pack-glow mx-auto mb-8">
                  <div className="pack-card-top bg-gradient-to-r from-[#34d399] to-[#22c55e]" />
                  <div className="pack-card-body">
                    <div className="w-12 h-12 rounded-xl bg-[#34d399] flex items-center justify-center shadow-lg shadow-[#34d399]/20">
                      <span className="text-lg font-bold">+{revealedCountries.length}</span>
                    </div>
                    <p className="font-bold text-sm mt-3">Countries Revealed!</p>
                  </div>
                  <div className="pack-card-bottom" />
                </div>
                <p className="text-xs text-[#34d399] uppercase tracking-wider">Success</p>
                <p className="text-sm text-[#888] mt-1">Check your portfolio for new countries.</p>
              </div>
            ) : hasCommit && !commitRevealed ? (
              /* Waiting for reveal */
              <div className="text-center">
                <div className="pack-card mx-auto mb-8 opacity-80">
                  <div className="pack-card-top bg-[#333]" />
                  <div className="pack-card-body">
                    <div className="w-12 h-12 rounded-xl bg-[#555] flex items-center justify-center">
                      <span className="text-lg">⏳</span>
                    </div>
                    <p className="font-bold text-sm mt-3">Committed</p>
                  </div>
                  <div className="pack-card-bottom" />
                </div>
                <p className="text-xs text-[#ff2d55] uppercase tracking-wider">Waiting</p>
                <p className="text-sm text-[#888] mt-1">
                  {blocksRemaining > 0
                    ? `${blocksRemaining} blocks until reveal (~${(blocksRemaining * 3).toFixed(0)}s)`
                    : "Ready to reveal!"
                  }
                </p>
                <div className="mt-4 w-48 h-2 bg-[#161616] rounded-full mx-auto overflow-hidden">
                  <div
                    className="h-full bg-[#ff2d55] rounded-full transition-all duration-1000"
                    style={{ width: `${Math.min(100, 100 - (blocksRemaining / (delayBlocks ? Number(delayBlocks) : 10)) * 100)}%` }}
                  />
                </div>
              </div>
            ) : (
              /* Default - ready to commit */
              <div className="text-center">
                <div className="pack-card pack-hover mx-auto mb-8">
                  <div className="pack-card-top" />
                  <div className="pack-card-body">
                    <div className="w-12 h-12 rounded-xl bg-[#ff2d55] flex items-center justify-center shadow-lg shadow-[#ff2d55]/20 logo-icon">
                      <span className="text-lg font-bold">⚽</span>
                    </div>
                    <p className="font-bold text-sm mt-3">FANOVO</p>
                  </div>
                  <div className="pack-card-bottom" />
                </div>
                <p className="text-xs text-[#555] uppercase tracking-wider">Ready</p>
                <p className="text-sm text-[#888] mt-1">Select pack count and commit FANOVO.</p>
              </div>
            )}
          </div>

          {/* Bottom controls */}
          <div className="border-t border-white/[0.06] px-6 py-4">
            {/* Pack count selector */}
            {!hasCommit || commitRevealed ? (
              <>
                <div className="flex items-center gap-2 mb-3">
                  <span className="text-xs text-[#555]">Packs (1-100):</span>
                  <input
                    type="number"
                    min={1}
                    max={100}
                    value={packCount}
                    onChange={(e) => setPackCount(Math.min(100, Math.max(1, Number(e.target.value))))}
                    className="w-16 bg-[#161616] border border-white/[0.08] rounded px-2 py-1 text-sm font-mono text-center"
                  />
                  <span className="text-xs text-[#555]">= {packCount} FANOVO</span>
                </div>
                <div className="flex items-center gap-4">
                  {isConnected ? (
                    needsApproval ? (
                      <button onClick={handleApprove} disabled={isApproving} className="btn-primary">
                        {isApproving ? "Approving..." : "Approve FANOVO"}
                      </button>
                    ) : (
                      <button
                        onClick={handleCommit}
                        disabled={!hasBalance || isAllowanceLoading || packCount > remaining}
                        className={`btn-primary ${isAllowanceLoading ? "opacity-50" : ""}`}
                      >
                        {isAllowanceLoading ? "Checking allowance..." : `Commit ${packCount} Pack${packCount > 1 ? "s" : ""}`}
                      </button>
                    )
                  ) : (
                    <span className="text-sm text-[#555]">Connect wallet</span>
                  )}
                  <span className="text-xs text-[#555]">Cost: {packCount} FANOVO</span>
                </div>
              </>
            ) : (
              /* Reveal controls */
              <div className="flex items-center gap-4 flex-wrap">
                <button
                  onClick={handleReveal}
                  disabled={!canReveal || isRevealPending}
                  className={`btn-primary ${!canReveal ? "opacity-50" : ""}`}
                >
                  {isRevealPending ? "Revealing..." : canReveal ? `Reveal ${commitCount} Pack${commitCount > 1 ? "s" : ""}` : `Wait ${blocksRemaining} blocks`}
                </button>
                <span className="text-xs text-[#555]">
                  {commitRevealed ? "Already revealed" : blocksRemaining > 0 ? `${blocksRemaining} blocks remaining` : "Ready to reveal!"}
                </span>
                {hasCommit && !commitRevealed && blockNumber && commitRevealBlock > 0n && (blockNumber - commitRevealBlock) > 256n && (
                  <button onClick={handleRecover} className="btn-secondary text-xs">
                    Recover stuck commit
                  </button>
                )}
              </div>
            )}

          </div>
        </div>

        {/* Right sidebar */}
        <div className="w-full lg:w-[280px] space-y-4">
          <div className="card p-5">
            <p className="text-[10px] text-[#555] uppercase tracking-wider mb-2">Pack Window</p>
            <p className="text-2xl font-bold font-mono">
              {packs.toLocaleString()}
              <span className="text-sm text-[#555] ml-1">/ {maxPackNum > 0 ? maxPackNum.toLocaleString() : "—"}</span>
            </p>
            <div className="mt-3 h-1 bg-[#161616] rounded-full overflow-hidden">
              <div className="h-full bg-[#ff2d55] rounded-full" style={{ width: `${progress}%` }} />
            </div>
            <div className="flex justify-between mt-1 text-[10px] text-[#555]">
              <span>Opened</span>
              <span>{progress.toFixed(1)}%</span>
            </div>
          </div>

          <div className="card p-5">
            <p className="text-[10px] text-[#555] uppercase tracking-wider mb-3">How it works</p>
            <div className="space-y-3 text-xs text-[#888]">
              <div className="flex gap-3">
                <span className="text-[#ff2d55] font-bold">1</span>
                <span>Commit: Select 1-100 packs and lock FANOVO</span>
              </div>
              <div className="flex gap-3">
                <span className="text-[#ff2d55] font-bold">2</span>
                <span>Wait: 10 blocks (~30 seconds) for randomness</span>
              </div>
              <div className="flex gap-3">
                <span className="text-[#ff2d55] font-bold">3</span>
                <span>Reveal: Unpack and receive random countries</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Holdings */}
      <Holdings refreshKey={revealReceipt?.transactionHash} />
    </div>
  );
}

function Holdings({ refreshKey }: { refreshKey?: string }) {
  const { address, isConnected } = useAccount();
  const queryClient = useQueryClient();

  useEffect(() => {
    if (refreshKey) {
      queryClient.invalidateQueries();
    }
  }, [refreshKey, queryClient]);

  const { data: tokenAddresses } = useReadContracts({
    contracts: COUNTRIES.map((country) => ({
      address: CONTRACTS.worldCupHook,
      abi: worldCupHookAbi,
      functionName: "getCountryToken" as const,
      args: [country.id] as const,
    })),
  });

  const { data: balances } = useReadContracts({
    contracts: tokenAddresses
      ? tokenAddresses.map((t) => ({
          address: (t.result as `0x${string}`) || "0x0000000000000000000000000000000000000000",
          abi: fanovoTokenAbi,
          functionName: "balanceOf" as const,
          args: [address || "0x0000000000000000000000000000000000000000"] as const,
        }))
      : [],
  });

  if (!isConnected) return null;

  const holdings = COUNTRIES.map((country, i) => {
    const balance = balances?.[i]?.result;
    const amount = balance ? Number(formatEther(balance as bigint)) : 0;
    return { ...country, amount };
  });

  const owned = holdings.filter((h) => h.amount > 0);

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-bold">Your holdings</h2>
        <span className="text-sm text-[#34d399]">
          {owned.length} of 48 collected
        </span>
      </div>

      <div className="grid grid-cols-4 sm:grid-cols-6 md:grid-cols-8 gap-3">
        {holdings.map((country) => {
          const hasTokens = country.amount > 0;
          return (
            <div
              key={country.id}
              className={`flex items-center gap-3 p-3 rounded-lg border ${
                hasTokens
                  ? "border-white/[0.1] bg-[#0d0d0d]"
                  : "border-white/[0.04] bg-[#0a0a0a]"
              }`}
            >
              <img
                src={getFlagUrl(country.symbol)}
                alt={country.name}
                className={`w-10 h-7 rounded object-cover ${hasTokens ? "opacity-100" : "opacity-30"}`}
              />
              <div>
                <p className={`text-xs font-medium ${hasTokens ? "text-white" : "text-[#444]"}`}>
                  {country.symbol}
                </p>
                <p className={`text-xs font-mono ${hasTokens ? "text-[#34d399]" : "text-[#333]"}`}>
                  {hasTokens ? country.amount.toFixed(0) : "–"}
                </p>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}


