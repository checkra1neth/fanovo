import { Header } from "@/components/Header";
import { HomeStatsBar } from "@/components/HomeStats";
import { HomePhases } from "@/components/HomePhases";
import { CONTRACTS, shortAddress } from "@/lib/contracts";
import { explorerAddressUrl } from "@/lib/wagmi";

export default function Home() {
  return (
    <div className="min-h-screen">
      <Header />
      <main className="max-w-[1200px] mx-auto px-6">
        {/* Hero */}
        <section className="py-16">
          <h1 className="text-5xl md:text-6xl font-bold leading-tight mb-4">
            Trade the
            <br />
            <span className="text-[#ff2d55]">World Cup.</span>
          </h1>
          <p className="text-[#888] text-base max-w-md mb-8 leading-relaxed">
            The pack window is open. 48 country curves are seeding. Every swap
            burns a fee in FANOVO, forever. Built on X Layer with Uniswap V4 Hooks.
          </p>
          <div className="flex items-center gap-3">
            <a href="/markets" className="btn-primary">Trade markets</a>
            <a href="/predict" className="btn-secondary">Predict</a>
            <a href="/portfolio" className="btn-secondary">Portfolio</a>
          </div>
        </section>

        <HomeStatsBar />

        {/* Two phases */}
        <section className="py-12">
          <p className="text-xs text-[#555] uppercase tracking-widest mb-2">How it works</p>
          <h2 className="text-2xl font-bold mb-8">
            Two phases. One contract. Phase 1 is live.
          </h2>

          <HomePhases />
        </section>

        {/* CTA */}
        <section className="py-16 flex items-center justify-between">
          <div>
            <h2 className="text-2xl font-bold">The 2026 World Cup,</h2>
            <p className="text-[#555] text-lg">priced and pulled.</p>
          </div>
          <div className="flex gap-3">
            <a href="/markets" className="btn-primary">Trade markets</a>
            <a href="/predict" className="btn-secondary">Predict</a>
          </div>
        </section>

        {/* Footer */}
        <footer className="border-t border-white/[0.08] py-6 flex items-center justify-between text-xs text-[#555]">
          <span>
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
          </span>
          <div className="flex gap-4">
            <a href="https://x.com/FanovoX" className="hover:text-white">X / Twitter</a>
            <a href="https://www.okx.com/web3/explorer/xlayer" className="hover:text-white">Explorer</a>
          </div>
        </footer>
      </main>
    </div>
  );
}
