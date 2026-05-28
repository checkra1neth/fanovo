"use client";

import { useReadContract } from "wagmi";
import { CONTRACTS } from "@/lib/contracts";
import { packOpenerAbi } from "@/lib/abi";

export function HomePhases() {
  const { data: maxPacks } = useReadContract({
    address: CONTRACTS.packOpener,
    abi: packOpenerAbi,
    functionName: "MAX_PACKS",
  });

  const maxPackNum = maxPacks ? Number(maxPacks) : 0;
  const packsLabel = maxPackNum > 0 ? maxPackNum.toLocaleString() : "—";

  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
      <PhaseCard
        phase="PHASE 1"
        status="LIVE"
        title="Pack window"
        metric={maxPackNum > 0 ? `${packsLabel} packs` : "Pack window"}
        lines={[
          "Burn 1 FANOVO, receive one random country.",
          "Most FANOVO seeds that country's curve.",
          "A portion is burned on the spot.",
        ]}
        details={["1 pack = 1 FANOVO = 1 country", maxPackNum > 0 ? `${packsLabel} packs total. Hard cap.` : "Hard cap.", "No re-rolls. No buyouts."]}
      />
      <PhaseCard
        phase="IGNITION"
        status="SEALED"
        title={maxPackNum > 0 ? `The ${packsLabel}th pack` : "The final pack"}
        metric="1 block"
        lines={[
          "The pack opener disables forever in the same transaction.",
          "Curves go live.",
          "The UI flips within one block.",
        ]}
        details={["On-chain event drives the flip", "No admin transition", "Reverts impossible after seal"]}
      />
      <PhaseCard
        phase="PHASE 2"
        status="PENDING"
        title="Curve trading"
        metric="48 curves"
        lines={[
          "Every country trades against FANOVO on constant-product curves with virtual reserves.",
          "Fee on every swap, burned.",
          "Supply approaches the asymptote, never reaches it.",
        ]}
        details={["No LPs. No P2P.", "FANOVO ⟷ COUNTRY.", "Supply approaches the asymptote, never reaches it."]}
      />
    </div>
  );
}

function PhaseCard({
  phase,
  status,
  title,
  metric,
  lines,
  details,
}: {
  phase: string;
  status: string;
  title: string;
  metric: string;
  lines: string[];
  details: string[];
}) {
  const statusColor = status === "LIVE"
    ? "bg-[#ff2d55] text-white"
    : status === "SEALED"
    ? "bg-[#333] text-[#888]"
    : "bg-[#222] text-[#555]";

  return (
    <div className="card p-5">
      <div className="flex items-center gap-2 mb-3">
        <span className="text-[10px] text-[#555] uppercase tracking-wider font-medium">{phase}</span>
        <span className={`text-[10px] px-2 py-0.5 rounded font-semibold ${statusColor}`}>
          {status}
        </span>
      </div>
      <h3 className="font-bold text-base mb-1">{title}</h3>
      <p className="text-sm text-[#ff2d55] mb-3">{metric}</p>
      <p className="text-xs text-[#888] leading-relaxed mb-3">
        {lines.join(" ")}
      </p>
      <div className="border-t border-white/[0.06] pt-3 space-y-1">
        {details.map((d, i) => (
          <p key={i} className="text-[11px] text-[#555]">{d}</p>
        ))}
      </div>
    </div>
  );
}
