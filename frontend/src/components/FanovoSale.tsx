"use client";

import { useState, useEffect } from "react";
import { useAccount, useReadContract, useWriteContract, useWaitForTransactionReceipt } from "wagmi";
import { formatUnits, parseUnits } from "viem";
import { useQueryClient } from "@tanstack/react-query";
import { CONTRACTS } from "@/lib/contracts";
import { fanovoSaleAbi, fanovoTokenAbi } from "@/lib/abi";

export function FanovoSaleComponent() {
  const { address, isConnected } = useAccount();
  const [usdtAmount, setUsdtAmount] = useState("");
  const queryClient = useQueryClient();

  const { data: poolCreated } = useReadContract({
    address: CONTRACTS.fanovoSale,
    abi: fanovoSaleAbi,
    functionName: "poolCreated",
  });

  const { data: fanovoBalance } = useReadContract({
    address: CONTRACTS.fanovoToken,
    abi: fanovoTokenAbi,
    functionName: "balanceOf",
    args: address ? [CONTRACTS.fanovoSale] : undefined,
  });

  const { data: userBalance } = useReadContract({
    address: CONTRACTS.fanovoToken,
    abi: fanovoTokenAbi,
    functionName: "balanceOf",
    args: address ? [address] : undefined,
  });

  const { data: usdtAllowance } = useReadContract({
    address: CONTRACTS.usdt,
    abi: fanovoTokenAbi,
    functionName: "allowance",
    args: address ? [address, CONTRACTS.fanovoSale] : undefined,
  });

  const { writeContract: approve, data: approveTx } = useWriteContract();
  const { writeContract: buy, data: buyTx } = useWriteContract();

  const { isLoading: isApproving, data: approveReceipt } = useWaitForTransactionReceipt({ hash: approveTx });
  const { isLoading: isBuying, isSuccess: buySuccess, data: buyReceipt } = useWaitForTransactionReceipt({ hash: buyTx });

  useEffect(() => {
    if (approveReceipt?.status === "success") {
      queryClient.invalidateQueries({ queryKey: ["readContract"] });
    }
  }, [approveReceipt, queryClient]);

  useEffect(() => {
    if (buyReceipt?.status === "success") {
      queryClient.invalidateQueries({ queryKey: ["readContract"] });
    }
  }, [buyReceipt, queryClient]);

  const usdtAmountBigInt = usdtAmount ? parseUnits(usdtAmount, 6) : 0n;
  const needsApproval = !usdtAllowance || (usdtAllowance as bigint) < usdtAmountBigInt;

  const fanovoAmount = usdtAmount ? Number(usdtAmount) * 2 : 0;
  const available = fanovoBalance ? Number(formatUnits(fanovoBalance, 18)) : 0;
  const userFanovo = userBalance ? Number(formatUnits(userBalance, 18)) : 0;

  const handleApprove = () => {
    approve({
      address: CONTRACTS.usdt,
      abi: fanovoTokenAbi,
      functionName: "approve",
      args: [CONTRACTS.fanovoSale, parseUnits("1000000", 6)],
    });
  };

  const handleBuy = () => {
    if (!usdtAmount || Number(usdtAmount) <= 0) return;
    buy({
      address: CONTRACTS.fanovoSale,
      abi: fanovoSaleAbi,
      functionName: "buy",
      args: [parseUnits(usdtAmount, 6)],
    });
  };

  if (poolCreated) {
    return (
      <div className="card p-10 text-center space-y-4">
        <div className="w-16 h-16 rounded-full bg-[#34d399]/10 flex items-center justify-center mx-auto">
          <span className="text-2xl">🌊</span>
        </div>
        <p className="text-lg font-bold">Trading is now live on Uniswap V4</p>
        <p className="text-sm text-[#888]">Fixed-price sales have ended. Buy FANOVO through the pool.</p>
        <a
          href={`https://app.uniswap.org/explore/pools/xlayer/${CONTRACTS.fanovoSale}`}
          target="_blank"
          rel="noopener noreferrer"
          className="btn-primary inline-block"
        >
          Trade on Uniswap
        </a>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Buy FANOVO</h1>
          <p className="text-sm text-[#888] mt-1">Fixed-price sale: 1 USDT = 2 FANOVO ($0.50 per FANOVO)</p>
        </div>
        <div className="text-right">
          <p className="text-xs text-[#555] uppercase tracking-wider">Available</p>
          <p className="text-2xl font-bold font-mono">
            {available.toLocaleString()}
            <span className="text-sm text-[#555]"> FANOVO</span>
          </p>
        </div>
      </div>

      {/* Sale card */}
      <div className="max-w-lg mx-auto card p-8 space-y-6">
        <div className="text-center space-y-2">
          <p className="text-[10px] text-[#555] uppercase tracking-wider">Price</p>
          <p className="text-3xl font-bold font-mono">0.50 USDT <span className="text-sm text-[#555]">/ FANOVO</span></p>
          <p className="text-xs text-[#888]">1 USDT = 2 FANOVO</p>
        </div>

        {/* Input */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <p className="text-[10px] text-[#555] uppercase tracking-wider">You Pay</p>
            <p className="text-[11px] text-[#555]">USDT</p>
          </div>
          <input
            type="number"
            placeholder="0.0"
            value={usdtAmount}
            onChange={(e) => setUsdtAmount(e.target.value)}
            className="w-full bg-[#0d0d0d] border border-white/[0.08] rounded-lg px-4 py-3 text-2xl font-mono font-bold text-white placeholder-[#333] outline-none focus:border-white/[0.15]"
          />
        </div>

        {/* Arrow */}
        <div className="flex justify-center">
          <div className="w-8 h-8 rounded-full bg-[#161616] border border-white/[0.08] flex items-center justify-center">
            <span className="text-[#555]">↓</span>
          </div>
        </div>

        {/* Output */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <p className="text-[10px] text-[#555] uppercase tracking-wider">You Receive</p>
            <p className="text-[11px] text-[#555]">FANOVO</p>
          </div>
          <div className="w-full bg-[#0d0d0d] border border-white/[0.08] rounded-lg px-4 py-3">
            <p className="text-2xl font-mono font-bold">{fanovoAmount > 0 ? fanovoAmount.toFixed(2) : "0.0"}</p>
          </div>
        </div>

        {/* Details */}
        <div className="space-y-2 text-xs text-[#555]">
          <div className="flex justify-between">
            <span>Rate</span>
            <span className="font-mono">1 USDT = 2 FANOVO</span>
          </div>
          <div className="flex justify-between">
            <span>Your balance</span>
            <span className="font-mono">{userFanovo.toFixed(2)} FANOVO</span>
          </div>
        </div>

        {/* Action */}
        {isConnected ? (
          needsApproval ? (
            <button onClick={handleApprove} disabled={isApproving} className="btn-primary w-full py-4 text-base">
              {isApproving ? "Approving USDT..." : "Approve USDT"}
            </button>
          ) : (
            <button
              onClick={handleBuy}
              disabled={isBuying || !usdtAmount || Number(usdtAmount) <= 0 || fanovoAmount > available}
              className="btn-primary w-full py-4 text-base"
            >
              {isBuying ? "Buying..." : fanovoAmount > available ? "Insufficient FANOVO" : `Buy ${fanovoAmount.toFixed(0)} FANOVO`}
            </button>
          )
        ) : (
          <div className="text-center py-4 text-sm text-[#555]">Connect wallet to buy</div>
        )}

        {buySuccess && (
          <p className="text-center text-xs text-[#34d399]">Purchase successful! FANOVO sent to your wallet.</p>
        )}
      </div>

      {/* Info */}
      <div className="max-w-lg mx-auto text-center text-xs text-[#555] space-y-1">
        <p>All USDT goes to the protocol treasury.</p>
        <p>Once the V4 pool is created, fixed-price sales will end and trading will move to the pool.</p>
      </div>
    </div>
  );
}
