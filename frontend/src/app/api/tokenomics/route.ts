import { NextResponse } from "next/server";
import { indexTokenomics } from "@/lib/indexer";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const { summary } = await indexTokenomics();
    return NextResponse.json(summary, {
      headers: {
        "Cache-Control": "public, s-maxage=30, stale-while-revalidate=60",
      },
    });
  } catch (err) {
    console.error("[api/tokenomics] error:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 500 }
    );
  }
}
