"use client";

import { useAccount, useSwitchChain } from "wagmi";
import { xlayer } from "@/lib/wagmi";

export function NetworkGuard({ children }: { children: React.ReactNode }) {
  const { isConnected, chainId } = useAccount();
  const { switchChain, isPending } = useSwitchChain();

  if (!isConnected) return <>{children}</>;

  if (chainId && chainId !== xlayer.id) {
    return (
      <>
        {children}
        <div className="fixed inset-0 z-[100] bg-black/80 backdrop-blur-sm flex items-center justify-center p-4" onClick={() => {}}>
          <div className="card p-8 max-w-sm text-center space-y-4">
            <p className="text-3xl">⚠️</p>
            <h2 className="text-lg font-bold">Wrong Network</h2>
            <p className="text-sm text-[#888]">
              Please switch to X Layer Mainnet to use this app.
            </p>
            <button
              onClick={() => switchChain({ chainId: xlayer.id })}
              disabled={isPending}
              className="btn-primary w-full"
            >
              {isPending ? "Switching..." : "Switch to X Layer"}
            </button>
            <p className="text-xs text-[#555]">Chain ID: 196 • rpc.xlayer.tech</p>
          </div>
        </div>
      </>
    );
  }

  return <>{children}</>;
}
