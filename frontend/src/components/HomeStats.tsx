"use client";

import { useReadContract } from "wagmi";
import { formatEther } from "viem";
import { CONTRACTS, shortAddress } from "@/lib/contracts";
import { explorerAddressUrl } from "@/lib/wagmi";
import { packOpenerAbi, fanovoTokenAbi, worldCupHookAbi } from "@/lib/abi";
import { useCountryTokens, useCountryCurves } from "@/lib/useFanovoData";

export function HomeStatsBar() {
  const { data: totalSupply } = useReadContract({
    address: CONTRACTS.fanovoToken,
    abi: fanovoTokenAbi,
    functionName: "totalSupply",
  });

  const { data: maxSupply } = useReadContract({
    address: CONTRACTS.fanovoToken,
    abi: fanovoTokenAbi,
    functionName: "MAX_SUPPLY",
  });

  const { data: packsOpened } = useReadContract({
    address: CONTRACTS.packOpener,
    abi: packOpenerAbi,
    functionName: "totalPacksOpened",
  });

  const { data: virtualFanovo } = useReadContract({
    address: CONTRACTS.worldCupHook,
    abi: worldCupHookAbi,
    functionName: "VIRTUAL_FANOVO",
  });

  // Read all curve states for real TVL (shared with Markets/Tokenomics through queryClient)
  const { addresses: tokenAddresses } = useCountryTokens();
  const { states: curveStates } = useCountryCurves(tokenAddresses);

  const supply = totalSupply ? Number(formatEther(totalSupply as bigint)) : 0;
  const max = maxSupply ? Number(formatEther(maxSupply as bigint)) : 0;
  const packs = packsOpened ? Number(packsOpened) : 0;
  const asymptote = virtualFanovo ? Number(formatEther(virtualFanovo as bigint)) : 0;

  const countryTvl = curveStates.reduce((sum, s) => {
    if (!s) return sum;
    const [realFanovo] = s;
    return sum + Number(formatEther(realFanovo));
  }, 0);

  return (
    <>
      {/* Stats row */}
      <section className="flex items-center gap-6 py-6 border-t border-white/[0.08] text-sm">
        <Stat label="TVL" value={countryTvl > 0 ? countryTvl.toLocaleString(undefined, { maximumFractionDigits: 0 }) : "—"} unit="FANOVO" />
        <Stat label="24H VOLUME" value="—" unit="" />
        <Stat label="TRADABLE TOKENS" value="192" sub="48 countries + 144 players" />
      </section>

      {/* Contract bar */}
      <section className="py-8 border-t border-white/[0.08]">
        <div className="flex flex-wrap items-center gap-x-8 gap-y-2 text-xs">
          <div>
            <span className="text-[#555]">FANOVO CONTRACT </span>
            <a
              href={explorerAddressUrl(CONTRACTS.fanovoToken)}
              target="_blank"
              rel="noreferrer"
              className="font-mono text-[#888] hover:text-white"
            >
              {shortAddress(CONTRACTS.fanovoToken)}
            </a>
          </div>
          <span className="text-[#555]">X Layer Mainnet • ERC-20 • {max > 0 ? `${(max / 1000).toFixed(0)}K` : "—"} fixed supply</span>
        </div>

        <div className="flex flex-wrap items-center gap-6 mt-4">
          <MiniStat label="FANOVO SUPPLY" value={supply > 0 ? supply.toLocaleString(undefined, { maximumFractionDigits: 0 }) : "—"} sub={max > 0 ? `${(max / 1000).toFixed(0)}K max, ERC20` : "—"} />
          <MiniStat label="PACK PRICE" value="1 FANOVO" sub={packs > 0 ? `${packs} opened` : "0 opened"} />
          <MiniStat label="COUNTRY TOKENS" value="48" sub={asymptote > 0 ? `asymptote ${asymptote.toLocaleString(undefined, { maximumFractionDigits: 0 })}` : "asymptote —"} />
          <MiniStat label="TRADE FEE" value="5%" sub="burned, in FANOVO" />
          <MiniStat label="CHAIN" value="X Layer" sub="" />
        </div>
      </section>
    </>
  );
}

function Stat({ label, value, unit, sub }: { label: string; value: string; unit?: string; sub?: string }) {
  return (
    <div>
      <p className="text-[10px] text-[#555] uppercase tracking-wider mb-0.5">{label}</p>
      <p className="font-bold text-lg">
        {value}
        {unit && <span className="text-sm text-[#555] ml-1">{unit}</span>}
      </p>
      {sub && <p className="text-[10px] text-[#555]">{sub}</p>}
    </div>
  );
}

function MiniStat({ label, value, sub }: { label: string; value: string; sub: string }) {
  return (
    <div>
      <p className="text-[10px] text-[#555] uppercase tracking-wider">{label}</p>
      <p className="font-bold text-sm">{value}</p>
      {sub && <p className="text-[10px] text-[#555]">{sub}</p>}
    </div>
  );
}
