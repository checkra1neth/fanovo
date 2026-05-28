"use client";

import { useAccount, useConnect, useDisconnect } from "wagmi";
import { injected } from "wagmi/connectors";
import Link from "next/link";
import { usePathname } from "next/navigation";

export function Header() {
  const { address, isConnected } = useAccount();
  const { connect } = useConnect();
  const { disconnect } = useDisconnect();
  const pathname = usePathname();

  const navItems = [
    { href: "/", label: "Overview" },
    { href: "/buy", label: "Buy" },
    { href: "/pack", label: "Pack" },
    { href: "/markets", label: "Markets" },
    { href: "/predict", label: "Predict" },
    { href: "/lineups", label: "Lineups" },
    { href: "/portfolio", label: "Portfolio" },
    { href: "/tokenomics", label: "Tokenomics" },
    { href: "/mechanics", label: "Mechanics" },
  ];

  return (
    <header className="border-b border-white/[0.08] sticky top-0 z-50 bg-[#050505]/95 backdrop-blur-sm">
      <div className="max-w-[1200px] mx-auto px-6 h-14 flex items-center justify-between">
        <div className="flex items-center gap-8">
          <Link href="/" className="flex items-center gap-2">
            <div className="w-6 h-6 rounded bg-[#ff2d55] flex items-center justify-center logo-icon">
              <span className="text-xs font-bold text-white">W</span>
            </div>
            <span className="font-semibold text-sm">FANOVO</span>
          </Link>

          <nav className="hidden md:flex items-center gap-1">
            {navItems.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className={`nav-link ${pathname === item.href ? "nav-link-active" : ""}`}
              >
                {item.label}
              </Link>
            ))}
          </nav>
        </div>

        <div>
          {isConnected ? (
            <button
              onClick={() => disconnect()}
              className="btn-secondary text-sm py-2 px-4 font-mono"
            >
              {address?.slice(0, 6)}…{address?.slice(-4)}
            </button>
          ) : (
            <button
              onClick={() => connect({ connector: injected() })}
              className="btn-primary text-sm py-2 px-4"
            >
              Connect wallet
            </button>
          )}
        </div>
      </div>
    </header>
  );
}
