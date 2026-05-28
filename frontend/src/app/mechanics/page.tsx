"use client";

import { Header } from "@/components/Header";
import { useProtocolConstants } from "@/components/ProtocolConstants";
import { CONTRACTS, shortAddress } from "@/lib/contracts";
import { explorerAddressUrl } from "@/lib/wagmi";

export default function MechanicsPage() {
  const { maxSupply, maxPacks, asymptote, feePct, loading } = useProtocolConstants();

  const supplyLabel = loading ? "—" : maxSupply > 0 ? maxSupply.toLocaleString(undefined, { maximumFractionDigits: 0 }) : "—";
  const packsLabel = loading ? "—" : maxPacks > 0 ? maxPacks.toLocaleString() : "—";
  const asymLabel = loading ? "—" : asymptote > 0 ? asymptote.toLocaleString(undefined, { maximumFractionDigits: 0 }) : "—";
  const feeLabel = loading ? "—" : feePct > 0 ? `${feePct.toFixed(2)}%` : "—";

  return (
    <div className="min-h-screen">
      <Header />
      <main className="max-w-[1000px] mx-auto px-6 py-12 space-y-20">
        {/* Header */}
        <div>
          <p className="text-[10px] text-[#555] uppercase tracking-widest mb-2">Mechanics</p>
          <h1 className="text-4xl font-bold mb-4">
            How <span className="text-[#ff2d55]">FANOVO</span> works.
          </h1>
          <p className="text-[#888] leading-relaxed max-w-lg">
            Closed-loop. One token in, one token out. 48 countries on their own curves.
            The protocol holds no opinion on who wins — only that every trade burns.
          </p>
        </div>

        {/* 01 - The Token */}
        <Row title="The token" num="01">
          <p className="text-sm text-[#888] leading-relaxed mb-4">
            FANOVO is a single ERC-20 on X Layer. {supplyLabel} total supply. No team allocation.
            No vesting. No mint function. Once deployed, the supply only goes one direction: down.
          </p>
          <div className="card flex divide-x divide-white/[0.06] overflow-hidden">
            <Stat label="SUPPLY" value={supplyLabel} />
            <Stat label="DECIMALS" value="18" />
            <Stat label="MINT" value="Disabled" />
          </div>
        </Row>

        {/* 02 - Two Phases */}
        <Row title="The two phases" num="02">
          <p className="text-sm text-[#888] leading-relaxed mb-4">
            Phase 1 is acquisition. Phase 2 is price discovery. They never overlap.
          </p>
          <div className="card p-6">
            {/* Timeline */}
            <div className="space-y-4 py-4">
              {/* 1. Top Labels Row */}
              <div className="flex justify-between items-end px-4 relative">
                {/* Phase 1 */}
                <div className="text-left max-w-[40%]">
                  <p className="font-bold text-sm">PHASE 1 – Pack window</p>
                  <p className="text-[11px] text-[#555] font-mono mt-1">{packsLabel} packs – pack opener live</p>
                </div>

                {/* Middle - Pack #N */}
                <div className="text-center absolute left-1/2 -translate-x-1/2 bottom-0">
                  <p className="text-xs text-[#ff2d55] font-bold">PACK #{packsLabel}</p>
                </div>

                {/* Phase 2 */}
                <div className="text-right max-w-[40%]">
                  <p className="font-bold text-sm text-[#ff2d55]">PHASE 2 – Curve trading</p>
                  <p className="text-[11px] text-[#555] font-mono mt-1">48 country curves – opener sealed</p>
                </div>
              </div>

              {/* 2. Timeline Axis Row */}
              <div className="relative h-6 flex items-center">
                {/* Horizontal Axis Line */}
                <div className="absolute left-4 right-4 h-[2px]">
                  <div className="h-full flex">
                    <div className="h-full bg-[#888] flex-[48]" />
                    <div className="h-full bg-[#ff2d55] flex-[48]" />
                  </div>
                </div>
                
                {/* Dots */}
                <div className="absolute left-4 w-3.5 h-3.5 -translate-x-1/2 rounded-full bg-[#888] border-2 border-[#888]" />
                <div className="absolute left-1/2 -translate-x-1/2 w-3.5 h-3.5 rounded-full bg-[#ff2d55] border-2 border-[#ff2d55]" />
                <div className="absolute right-4 translate-x-1/2 w-3.5 h-3.5 rounded-full bg-[#ff2d55] border-2 border-[#ff2d55]" />
              </div>

              {/* 3. Bottom Labels Row */}
              <div className="flex justify-center px-4">
                <p className="text-[11px] text-[#555] font-mono">on-chain event – 1 block</p>
              </div>
            </div>
          </div>
        </Row>

        {/* 03 - The Curve */}
        <Row title="The curve" num="03">
          <p className="text-sm text-[#888] leading-relaxed mb-4">
            Constant-product with virtual reserves. Asymptote at {asymLabel}. Mathematically unreachable.
          </p>
          <div className="card p-6">
            {/* Curve SVG */}
            <svg viewBox="0 0 400 200" className="w-full h-56">
              {/* Grid lines */}
              <line x1="40" y1="40" x2="380" y2="40" stroke="#222" strokeWidth="0.5" />
              <line x1="40" y1="80" x2="380" y2="80" stroke="#222" strokeWidth="0.5" />
              <line x1="40" y1="120" x2="380" y2="120" stroke="#222" strokeWidth="0.5" />
              <line x1="40" y1="160" x2="380" y2="160" stroke="#222" strokeWidth="0.5" />
              {/* Axes */}
              <line x1="40" y1="180" x2="380" y2="180" stroke="#444" strokeWidth="1" />
              <line x1="40" y1="20" x2="40" y2="180" stroke="#444" strokeWidth="1" />
              {/* Asymptote dashed line */}
              <line x1="360" y1="20" x2="360" y2="180" stroke="#555" strokeWidth="1" strokeDasharray="4 3" />
              {/* Curve */}
              <path
                d="M40,178 C80,177 120,176 160,174 C200,170 240,160 280,140 C300,125 320,100 340,60 C350,35 355,22 358,15"
                fill="none"
                stroke="#ff2d55"
                strokeWidth="2"
              />
              {/* Labels */}
              <text x="42" y="32" fill="#888" fontSize="10" fontFamily="monospace">price (FANOVO)</text>
              <text x="42" y="195" fill="#888" fontSize="10" fontFamily="monospace">supply →</text>
              <text x="290" y="32" fill="#888" fontSize="10" fontFamily="monospace">asymptote – {asymLabel}</text>
            </svg>
          </div>
          <p className="text-sm text-[#888] font-mono mt-4">
            price = K / (asymptote − supply)², where K is calibrated per country at pack-window seal
          </p>
        </Row>

        {/* 04 - The Burn Flywheel */}
        <Row title="The burn flywheel" num="04">
          <p className="text-sm text-[#888] leading-relaxed mb-4">
            Every swap shrinks the only currency that can buy anything in the system.
          </p>
          <div className="card p-8">
            <svg viewBox="0 0 500 280" className="w-full h-64">
              {/* Boxes */}
              <rect x="40" y="30" width="160" height="60" rx="8" fill="#161616" stroke="#333" strokeWidth="1" />
              <rect x="300" y="30" width="160" height="60" rx="8" fill="#161616" stroke="#333" strokeWidth="1" />
              <rect x="300" y="190" width="160" height="60" rx="8" fill="#161616" stroke="#333" strokeWidth="1" />
              <rect x="40" y="190" width="160" height="60" rx="8" fill="#161616" stroke="#333" strokeWidth="1" />

              {/* Box text */}
              <text x="120" y="55" fill="white" fontSize="12" fontWeight="bold" textAnchor="middle">Trade executes</text>
              <text x="120" y="73" fill="#888" fontSize="10" textAnchor="middle" fontFamily="monospace">on any curve</text>

              <text x="380" y="55" fill="white" fontSize="12" fontWeight="bold" textAnchor="middle">{feeLabel} fee taken</text>
              <text x="380" y="73" fill="#888" fontSize="10" textAnchor="middle" fontFamily="monospace">in FANOVO</text>

              <text x="380" y="215" fill="white" fontSize="12" fontWeight="bold" textAnchor="middle">FANOVO burned</text>
              <text x="380" y="233" fill="#888" fontSize="10" textAnchor="middle" fontFamily="monospace">forever</text>

              <text x="120" y="215" fill="white" fontSize="12" fontWeight="bold" textAnchor="middle">FANOVO supply ↓</text>
              <text x="120" y="233" fill="#888" fontSize="10" textAnchor="middle" fontFamily="monospace">{supplyLabel} cap</text>

              {/* Arrows - clockwise */}
              {/* Top: left → right */}
              <line x1="200" y1="60" x2="295" y2="60" stroke="#ff2d55" strokeWidth="1.5" markerEnd="url(#arrow)" />
              {/* Right: top → bottom */}
              <line x1="380" y1="90" x2="380" y2="185" stroke="#ff2d55" strokeWidth="1.5" markerEnd="url(#arrow)" />
              {/* Bottom: right → left */}
              <line x1="300" y1="220" x2="205" y2="220" stroke="#ff2d55" strokeWidth="1.5" markerEnd="url(#arrow)" />
              {/* Left: bottom → top */}
              <line x1="120" y1="190" x2="120" y2="95" stroke="#ff2d55" strokeWidth="1.5" markerEnd="url(#arrow)" />

              {/* Arrow marker */}
              <defs>
                <marker id="arrow" markerWidth="8" markerHeight="8" refX="6" refY="4" orient="auto">
                  <path d="M0,0 L8,4 L0,8 Z" fill="#ff2d55" />
                </marker>
              </defs>
            </svg>
          </div>
        </Row>

        {/* 05 - The Asymptote */}
        <Row title="The asymptote" num="05">
          <p className="text-sm text-[#888] leading-relaxed mb-3">
            Each country has an asymptotic cap of {asymLabel} tokens. The curve makes the price
            approach infinity as supply approaches {asymLabel}, so the cap is never actually minted.
            There is no team allocation. No reserve. No backdoor.
          </p>
          <p className="text-sm text-[#888] leading-relaxed">
            Past ~95% supply, the curve turns parabolic. A handful of countries will get there.
            Most won&apos;t. The set is a market, not a checklist.
          </p>
        </Row>

        {/* 06 - The Players */}
        <Row title="The players" num="06">
          <p className="text-sm text-[#888] leading-relaxed mb-4">
            Once you hold a country token you can open it for a player. Every country deploys
            three player tokens at genesis — Captain, Best, Rookie — each with its own bonding
            curve quoted in that country&apos;s token. 450 packs per country, distributed across the
            three roles by their pack caps. Chainlink VRF picks the role for every pack so
            distribution is provably fair.
          </p>
          <div className="card flex divide-x divide-white/[0.06] overflow-hidden">
            <div className="flex-1 px-5 py-4">
              <p className="text-xs"><span className="text-[#f59e0b] font-bold">CAPTAIN</span> <span className="text-[#555]">· BROAD</span></p>
              <p className="text-lg font-bold mt-1">150 packs</p>
              <p className="text-xs text-[#555] font-mono">1,500 max</p>
            </div>
            <div className="flex-1 px-5 py-4">
              <p className="text-xs"><span className="text-[#34d399] font-bold">BEST</span> <span className="text-[#555]">· SCARCE</span></p>
              <p className="text-lg font-bold mt-1">50 packs</p>
              <p className="text-xs text-[#555] font-mono">500 max</p>
            </div>
            <div className="flex-1 px-5 py-4">
              <p className="text-xs"><span className="text-[#ff2d55] font-bold">ROOKIE</span> <span className="text-[#555]">· COMMON</span></p>
              <p className="text-lg font-bold mt-1">250 packs</p>
              <p className="text-xs text-[#555] font-mono">2,500 max</p>
            </div>
          </div>
          <p className="text-sm text-[#888] leading-relaxed mt-4">
            Player packs cost 1 country token each and follow the same two-step flow as country
            packs: open requests a VRF draw, then claim mints the revealed player to your wallet.
            Trading opens once a country&apos;s 450-pack window seals.
          </p>
        </Row>

        {/* 07 - Uniswap V4 Hook */}
        <Row title="The Uniswap V4 Hook" num="07">
          <p className="text-sm text-[#888] leading-relaxed mb-4">
            All trading logic lives inside a single Uniswap V4 Hook. The hook intercepts
            swaps via <code className="text-white bg-[#161616] px-1.5 py-0.5 rounded text-xs">beforeSwap</code> and
            implements the bonding curve + burn. No external LP. No admin keys on trading.
          </p>
          <div className="card flex divide-x divide-white/[0.06] overflow-hidden">
            <Stat label="HOOK" value="beforeSwap" />
            <Stat label="LP" value="Blocked" />
            <Stat label="FEE" value={feeLabel + " burn"} />
          </div>
        </Row>

        {/* CTA */}
        <div className="text-center py-8">
          <h2 className="text-2xl font-bold mb-1">One round.</h2>
          <p className="text-2xl font-bold text-[#888]">48 outcomes.</p>
          <div className="flex justify-center gap-3 mt-6">
            <a href="/pack" className="btn-primary">Open the opener</a>
            <a href="/markets" className="btn-trade px-5 py-2.5">Preview markets</a>
          </div>
        </div>

        {/* Footer */}
        <div className="border-t border-white/[0.06] pt-6 text-center space-y-1">
          <p className="text-xs text-[#555]">
            FANOVO contract{" "}
            <a
              href={explorerAddressUrl(CONTRACTS.fanovoToken)}
              target="_blank"
              rel="noreferrer"
              className="font-mono text-[#888] hover:text-white"
            >
              {shortAddress(CONTRACTS.fanovoToken)}
            </a>
            {" "}• X Layer Mainnet • 2026
          </p>
        </div>
      </main>
    </div>
  );
}

function Row({ title, num, children }: { title: string; num: string; children: React.ReactNode }) {
  return (
    <section className="grid grid-cols-1 md:grid-cols-[200px_1fr] gap-8 items-start">
      <div>
        <p className="text-[10px] text-[#555] font-mono mb-1">{num}</p>
        <h2 className="text-xl font-bold leading-tight">{title}</h2>
      </div>
      <div>{children}</div>
    </section>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex-1 px-4 py-3 border-r border-white/[0.06] last:border-r-0">
      <p className="text-[10px] text-[#555] uppercase tracking-wider mb-1">{label}</p>
      <p className="text-lg font-bold">{value}</p>
    </div>
  );
}


