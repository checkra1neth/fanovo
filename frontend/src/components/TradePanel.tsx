"use client";

import { useState } from "react";
import { useAccount, useReadContract, useWriteContract } from "wagmi";
import { useQueryClient } from "@tanstack/react-query";
import { formatEther, parseEther, maxUint256 } from "viem";
import { CONTRACTS, COUNTRIES, getFlagUrl } from "@/lib/contracts";
import { worldCupHookAbi, fanovoTokenAbi, curveRouterAbi } from "@/lib/abi";
import Link from "next/link";

type Tab = "chart" | "trade" | "stats";

export function TradePanel({ countryId }: { countryId: number }) {
  const [tab, setTab] = useState<Tab>("trade");
  const [side, setSide] = useState<"buy" | "sell">("buy");
  const [amount, setAmount] = useState("");
  const [txStatus, setTxStatus] = useState<"idle" | "approving" | "swapping" | "done" | "error">("idle");
  const { address, isConnected } = useAccount();
  const queryClient = useQueryClient();

  const country = COUNTRIES[countryId];
  if (!country) return <p>Country not found</p>;

  const { data: phase2Active } = useReadContract({
    address: CONTRACTS.worldCupHook,
    abi: worldCupHookAbi,
    functionName: "phase2Active",
  });

  // Read country token address
  const { data: countryTokenAddr } = useReadContract({
    address: CONTRACTS.worldCupHook,
    abi: worldCupHookAbi,
    functionName: "getCountryToken",
    args: [BigInt(countryId)],
  });

  const { data: price } = useReadContract({
    address: CONTRACTS.worldCupHook,
    abi: worldCupHookAbi,
    functionName: "currentPrice",
    args: [countryTokenAddr as `0x${string}`],
  });

  // Read curve state (reserves)
  const { data: curveState } = useReadContract({
    address: CONTRACTS.worldCupHook,
    abi: worldCupHookAbi,
    functionName: "getCurveState",
    args: [(countryTokenAddr as `0x${string}`) || "0x0000000000000000000000000000000000000000"],
    query: { enabled: !!countryTokenAddr },
  });

  // Read virtual reserves from contract
  const { data: virtualFifa } = useReadContract({
    address: CONTRACTS.worldCupHook,
    abi: worldCupHookAbi,
    functionName: "VIRTUAL_FANOVO",
    query: { enabled: !!countryTokenAddr },
  });

  const { data: virtualCountry } = useReadContract({
    address: CONTRACTS.worldCupHook,
    abi: worldCupHookAbi,
    functionName: "VIRTUAL_COUNTRY",
    query: { enabled: !!countryTokenAddr },
  });

  // Read swap fee from contract
  const { data: swapFeeBpsData } = useReadContract({
    address: CONTRACTS.worldCupHook,
    abi: worldCupHookAbi,
    functionName: "SWAP_FEE_BPS",
    query: { enabled: !!countryTokenAddr },
  });

  const { data: bpsDenomData } = useReadContract({
    address: CONTRACTS.worldCupHook,
    abi: worldCupHookAbi,
    functionName: "BPS_DENOM",
    query: { enabled: !!countryTokenAddr },
  });

  const asymptote = virtualFifa ? Number(formatEther(virtualFifa as bigint)) : 0;

  // Local quote calculation using real contract constants
  const VIRTUAL_FANOVO = virtualFifa ? (virtualFifa as bigint) : 0n;
  const VIRTUAL_COUNTRY = virtualCountry ? (virtualCountry as bigint) : 0n;
  const SWAP_FEE_BPS = swapFeeBpsData ? (swapFeeBpsData as bigint) : 0n;
  const BPS_DENOM = bpsDenomData ? (bpsDenomData as bigint) : 10000n;

  const quoteResult = (() => {
    if (!amount || Number(amount) <= 0 || !curveState || VIRTUAL_FANOVO === 0n || VIRTUAL_COUNTRY === 0n || SWAP_FEE_BPS === 0n) return undefined;
    const amountIn = parseEther(amount);
    const realFIFA = curveState[0];
    const circulating = curveState[1];
    const vfPlusRf = VIRTUAL_FANOVO + realFIFA;
    const vcMinusCirc = VIRTUAL_COUNTRY - circulating;

    if (side === "buy") {
      const burnAmount = (amountIn * SWAP_FEE_BPS) / BPS_DENOM;
      const effectiveIn = amountIn - burnAmount;
      if (effectiveIn === 0n) return 0n;
      const amountOut = (vcMinusCirc * effectiveIn) / (vfPlusRf + effectiveIn);
      return amountOut;
    } else {
      if (amountIn > circulating) return 0n;
      const grossFifaOut = (vfPlusRf * amountIn) / (vcMinusCirc + amountIn);
      if (grossFifaOut === 0n) return 0n;
      const burnAmount = (grossFifaOut * SWAP_FEE_BPS) / BPS_DENOM;
      const fanovoToUser = grossFifaOut - burnAmount;
      return fanovoToUser;
    }
  })();

  // Read country token supply
  const { data: supply } = useReadContract({
    address: (countryTokenAddr as `0x${string}`) || "0x0000000000000000000000000000000000000000",
    abi: fanovoTokenAbi,
    functionName: "totalSupply",
    query: { enabled: !!countryTokenAddr },
  });

  // User FANOVO balance
  const { data: fanovoBalance } = useReadContract({
    address: CONTRACTS.fanovoToken,
    abi: fanovoTokenAbi,
    functionName: "balanceOf",
    args: address ? [address] : undefined,
  });

  // User country token balance
  const { data: countryBalance } = useReadContract({
    address: (countryTokenAddr as `0x${string}`) || "0x0000000000000000000000000000000000000000",
    abi: fanovoTokenAbi,
    functionName: "balanceOf",
    args: address ? [address] : undefined,
  });

  const priceNum = price ? Number(formatEther(price as bigint)) : 0;
  const fanovoReserve = curveState ? Number(formatEther(curveState[0])) : 0;
  const supplyNum = supply ? Number(formatEther(supply as bigint)) : 0;
  const marketCap = priceNum * supplyNum;
  const quoteNum = quoteResult ? Number(formatEther(quoteResult as bigint)) : 0;
  const burnFee = amount ? Number(amount) * 0.05 : 0;
  const userFanovo = fanovoBalance ? Number(formatEther(fanovoBalance as bigint)) : 0;
  const userCountry = countryBalance ? Number(formatEther(countryBalance as bigint)) : 0;

  // Write contracts
  const { writeContractAsync: approveERC20 } = useWriteContract();
  const { writeContractAsync: executeSwap } = useWriteContract();

  // Check ERC20 allowance to CurveRouter
  const { data: erc20Allowance } = useReadContract({
    address: side === "buy" ? CONTRACTS.fanovoToken : (countryTokenAddr as `0x${string}`),
    abi: fanovoTokenAbi,
    functionName: "allowance",
    args: address ? [address, CONTRACTS.curveRouter] : undefined,
  });

  const handleSwap = async () => {
    if (!address || !amount || !countryTokenAddr) return;
    const amountIn = parseEther(amount);
    const amountOutMin = quoteResult ? (quoteResult as bigint) * 99n / 100n : 0n; // 1% slippage

    const tokenIn = side === "buy" ? CONTRACTS.fanovoToken : (countryTokenAddr as `0x${string}`);

    try {
      setTxStatus("approving");

      // Approve token to CurveRouter if needed
      const erc20Allow = erc20Allowance as bigint | undefined;
      if (!erc20Allow || erc20Allow < amountIn) {
        await approveERC20({
          address: tokenIn,
          abi: fanovoTokenAbi,
          functionName: "approve",
          args: [CONTRACTS.curveRouter, maxUint256],
        });
        queryClient.invalidateQueries({ queryKey: ["readContract"] });
      }

      setTxStatus("swapping");

      // Use CurveRouter for simplified swap
      if (side === "buy") {
        await executeSwap({
          address: CONTRACTS.curveRouter,
          abi: curveRouterAbi,
          functionName: "buy",
          args: [countryTokenAddr as `0x${string}`, amountIn, amountOutMin],
        });
      } else {
        await executeSwap({
          address: CONTRACTS.curveRouter,
          abi: curveRouterAbi,
          functionName: "sell",
          args: [countryTokenAddr as `0x${string}`, amountIn, amountOutMin],
        });
      }

      queryClient.invalidateQueries();
      setTxStatus("done");
      setAmount("");
      setTimeout(() => setTxStatus("idle"), 3000);
    } catch {
      setTxStatus("error");
      setTimeout(() => setTxStatus("idle"), 3000);
    }
  };

  return (
    <div className="space-y-6">
      {/* Back link */}
      <Link href="/markets" className="text-sm text-[#888] hover:text-white transition-colors">
        ← Markets
      </Link>

      {/* Country header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <img
            src={getFlagUrl(country.symbol)}
            alt={country.name}
            className="w-12 h-8 rounded-lg object-cover"
          />
          <div>
            <p className="text-[11px] text-[#555]">{country.symbol}</p>
            <p className="text-2xl font-bold">{country.name}</p>
          </div>
        </div>
        <div className="text-right">
          <p className="text-3xl font-bold font-mono">{priceNum > 0 ? priceNum.toFixed(4) : "—"} <span className="text-sm text-[#555]">FANOVO</span></p>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-6 border-b border-white/[0.06]">
        {(["chart", "trade", "stats"] as Tab[]).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`pb-3 text-sm font-medium capitalize transition-colors ${
              tab === t ? "text-white border-b-2 border-[#ff2d55]" : "text-[#555] hover:text-[#888]"
            }`}
          >
            {t}
          </button>
        ))}
      </div>

      {/* Tab content */}
      {tab === "trade" && (
        <div className="space-y-4">
          {!phase2Active ? (
            /* Phase 2 placeholder */
            <div className="card p-8 text-center space-y-4">
              <div className="w-16 h-16 rounded-full bg-[#ff2d55]/10 flex items-center justify-center mx-auto">
                <span className="text-2xl">🔒</span>
              </div>
              <div>
                <p className="text-lg font-bold">Trading opens in Phase 2</p>
                <p className="text-sm text-[#888] mt-1">
                  Swaps are disabled until the pack window closes and V4 pools are initialized.
                </p>
              </div>
              <div className="flex justify-center gap-6 text-xs text-[#555]">
                <div className="text-center">
                  <p className="text-[#888]">Curve price</p>
                  <p className="font-mono">{priceNum.toFixed(4)} FANOVO</p>
                </div>
                <div className="text-center">
                  <p className="text-[#888]">Supply</p>
                  <p className="font-mono">{supplyNum.toFixed(0)}</p>
                </div>
                <div className="text-center">
                  <p className="text-[#888]">Liquidity</p>
                  <p className="font-mono">{fanovoReserve.toFixed(0)} FANOVO</p>
                </div>
              </div>
            </div>
          ) : (
            /* Trade form */
            <>
              {/* Buy/Sell toggle */}
              <div className="flex rounded-lg overflow-hidden border border-white/[0.08]">
                <button
                  onClick={() => setSide("buy")}
                  className={`flex-1 py-3 text-sm font-semibold transition-colors ${
                    side === "buy" ? "bg-[#34d399]/10 text-[#34d399]" : "bg-transparent text-[#555]"
                  }`}
                >
                  Buy
                </button>
                <button
                  onClick={() => setSide("sell")}
                  className={`flex-1 py-3 text-sm font-semibold transition-colors ${
                    side === "sell" ? "bg-[#ff2d55]/10 text-[#ff2d55]" : "bg-transparent text-[#555]"
                  }`}
                >
                  Sell
                </button>
              </div>

              {/* You pay */}
              <div className="card p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <p className="text-[10px] text-[#555] uppercase tracking-wider">You Pay</p>
                  <p className="text-[11px] text-[#555]">
                    Balance: {side === "buy" ? userFanovo.toFixed(2) + " FANOVO" : userCountry.toFixed(2) + " " + country.symbol}
                  </p>
                </div>
                <div className="flex items-center justify-between">
                  <input
                    type="number"
                    placeholder="0.0"
                    value={amount}
                    onChange={(e) => setAmount(e.target.value)}
                    className="bg-transparent text-2xl font-mono font-bold outline-none w-full text-white placeholder-[#333]"
                  />
                  <div className="flex items-center gap-2 bg-[#161616] rounded-lg px-3 py-1.5 border border-white/[0.06]">
                    {side === "buy" ? (
                      <>
                        <div className="w-5 h-5 rounded bg-[#ff2d55] flex items-center justify-center logo-icon">
                          <span className="text-[8px] font-bold">W</span>
                        </div>
                        <span className="text-sm font-medium">FANOVO</span>
                      </>
                    ) : (
                      <>
                        <img src={getFlagUrl(country.symbol)} alt="" className="w-5 h-3.5 rounded object-cover" />
                        <span className="text-sm font-medium">{country.symbol}</span>
                      </>
                    )}
                  </div>
                </div>
                <div className="flex gap-2">
                  {["25%", "50%", "MAX"].map((pct) => (
                    <button
                      key={pct}
                      onClick={() => {
                        if (side === "buy") {
                          const mult = pct === "25%" ? 0.25 : pct === "50%" ? 0.5 : 1;
                          setAmount((userFanovo * mult).toFixed(4));
                        } else {
                          const mult = pct === "25%" ? 0.25 : pct === "50%" ? 0.5 : 1;
                          setAmount((userCountry * mult).toFixed(4));
                        }
                      }}
                      className="text-[10px] text-[#555] border border-white/[0.08] rounded px-2 py-1 hover:text-white hover:border-white/[0.15] transition-colors"
                    >
                      {pct}
                    </button>
                  ))}
                </div>
              </div>

              {/* Arrow */}
              <div className="flex justify-center">
                <div className="w-8 h-8 rounded-full bg-[#161616] border border-white/[0.08] flex items-center justify-center">
                  <span className="text-[#555]">↓</span>
                </div>
              </div>

              {/* You receive */}
              <div className="card p-4 space-y-3">
                <p className="text-[10px] text-[#555] uppercase tracking-wider">You Receive (Est.)</p>
                <div className="flex items-center justify-between">
                  <p className="text-2xl font-mono font-bold text-white">
                    {quoteNum > 0 ? quoteNum.toFixed(4) : "0.0"}
                  </p>
                  <div className="flex items-center gap-2 bg-[#161616] rounded-lg px-3 py-1.5 border border-white/[0.06]">
                    {side === "buy" ? (
                      <>
                        <img src={getFlagUrl(country.symbol)} alt="" className="w-5 h-3.5 rounded object-cover" />
                        <span className="text-sm font-medium">{country.symbol}</span>
                      </>
                    ) : (
                      <>
                        <div className="w-5 h-5 rounded bg-[#ff2d55] flex items-center justify-center logo-icon">
                          <span className="text-[8px] font-bold">W</span>
                        </div>
                        <span className="text-sm font-medium">FANOVO</span>
                      </>
                    )}
                  </div>
                </div>
              </div>

              {/* Trade details */}
              <div className="card p-4 space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-[#888]">Curve price</span>
                  <span className="font-mono">{priceNum.toFixed(4)} FANOVO/{country.symbol}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-[#888]">Burn fee ({SWAP_FEE_BPS > 0 ? (Number(SWAP_FEE_BPS) / 100).toFixed(2) : "—"}%)</span>
                  <span className="font-mono">{burnFee.toFixed(4)} {side === "buy" ? "FANOVO" : country.symbol}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-[#888]">Max slippage</span>
                  <span className="font-mono">1%</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-[#888]">Route</span>
                  <span className="font-mono text-xs">WorldCupHook – Uniswap V4</span>
                </div>
              </div>

              {/* Action button */}
              <button
                onClick={handleSwap}
                disabled={!isConnected || !amount || Number(amount) <= 0 || txStatus !== "idle"}
                className="btn-primary w-full py-4 text-base"
              >
                {!isConnected
                  ? "Connect wallet"
                  : txStatus === "approving"
                  ? "Approving..."
                  : txStatus === "swapping"
                  ? "Swapping..."
                  : txStatus === "done"
                  ? "✓ Done!"
                  : txStatus === "error"
                  ? "Error — try again"
                  : !amount || Number(amount) <= 0
                  ? "Enter an amount"
                  : side === "buy"
                  ? `Buy ${country.symbol}`
                  : `Sell ${country.symbol}`}
              </button>

              <p className="text-center text-xs text-[#555]">
                Every swap burns a fee in FANOVO. Routed through WorldCupHook into the Uniswap V4 pool.
              </p>
            </>
          )}
        </div>
      )}

      {tab === "stats" && (
        <div className="space-y-6">
          {/* Stats grid */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <p className="text-[10px] text-[#555] uppercase tracking-wider mb-1">Circulating Supply</p>
              <p className="text-xl font-bold font-mono">{supplyNum.toFixed(3)}</p>
              <p className="text-xs text-[#555]">{supplyNum > 0 && asymptote > 0 ? ((supplyNum / asymptote) * 100).toFixed(1) : "0.0"}% of asymptote</p>
            </div>
            <div>
              <p className="text-[10px] text-[#555] uppercase tracking-wider mb-1">Market Cap</p>
              <p className="text-xl font-bold font-mono">{marketCap.toFixed(3)} FANOVO</p>
              <p className="text-xs text-[#555]">price × circulating</p>
            </div>
            <div>
              <p className="text-[10px] text-[#555] uppercase tracking-wider mb-1">Liquidity</p>
              <p className="text-xl font-bold font-mono">{fanovoReserve.toFixed(3)} FANOVO</p>
              <p className="text-xs text-[#555]">real FANOVO backing the curve</p>
            </div>
            <div>
              <p className="text-[10px] text-[#555] uppercase tracking-wider mb-1">Burn Fee</p>
              <p className="text-xl font-bold font-mono">{SWAP_FEE_BPS > 0 ? (Number(SWAP_FEE_BPS) / 100).toFixed(2) : "—"}%</p>
              <p className="text-xs text-[#555]">of every swap</p>
            </div>
          </div>

          {/* Supply curve */}
          <div className="card p-5">
            <p className="text-[10px] text-[#555] uppercase tracking-wider mb-3">Supply Curve</p>
            <div className="h-2 bg-[#161616] rounded-full overflow-hidden mb-2">
              <div
                className="h-full bg-[#ff2d55] rounded-full"
                style={{ width: `${supplyNum > 0 && asymptote > 0 ? (supplyNum / asymptote) * 100 : 0}%` }}
              />
            </div>
            <div className="flex justify-between text-xs text-[#555]">
              <span>0</span>
              <span>{supplyNum.toFixed(3)} circulating</span>
              <span>{asymptote.toLocaleString()}</span>
            </div>
            <p className="text-xs text-[#555] mt-3">
              Beyond ~95% supply, the curve goes parabolic. The asymptote is mathematically unreachable.
            </p>
          </div>
        </div>
      )}

      {tab === "chart" && (
        <div className="space-y-6">
          {/* Current price stats */}
          <div className="card p-5 space-y-4">
            <p className="text-[10px] text-[#555] uppercase tracking-wider mb-3">Current Price</p>
            <div className="flex items-center justify-between">
              <div>
                <p className="text-3xl font-bold font-mono">{priceNum > 0 ? priceNum.toFixed(4) : "—"}</p>
                <p className="text-sm text-[#555]">FANOVO / {country.symbol}</p>
              </div>
            </div>
            <div className="grid grid-cols-3 gap-4 pt-4 border-t border-white/[0.06]">
              <div>
                <p className="text-[10px] text-[#555] uppercase tracking-wider">Supply</p>
                <p className="text-lg font-mono font-bold">{supplyNum > 0 ? supplyNum.toFixed(0) : "—"}</p>
              </div>
              <div>
                <p className="text-[10px] text-[#555] uppercase tracking-wider">Market Cap</p>
                <p className="text-lg font-mono font-bold">{marketCap > 0 ? marketCap.toFixed(0) : "—"}</p>
                <p className="text-xs text-[#555]">FANOVO</p>
              </div>
              <div>
                <p className="text-[10px] text-[#555] uppercase tracking-wider">Liquidity</p>
                <p className="text-lg font-mono font-bold">{fanovoReserve > 0 ? fanovoReserve.toFixed(0) : "—"}</p>
                <p className="text-xs text-[#555]">FANOVO</p>
              </div>
            </div>
            <p className="text-xs text-[#555]">
              Price history chart requires trade activity. Current data is read directly from the WorldCupHook contract.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}


