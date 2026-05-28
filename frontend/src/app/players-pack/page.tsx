import { Header } from "@/components/Header";
import Link from "next/link";

export default function PlayersPackPage() {
  return (
    <div className="min-h-screen">
      <Header />
      <main className="max-w-[1200px] mx-auto px-6 py-16 text-center space-y-4">
        <p className="text-3xl mb-2">🎒</p>
        <h1 className="text-xl font-bold">Player Packs</h1>
        <p className="text-sm text-[#888] max-w-md mx-auto">
          Player pack opening has moved. Browse all countries and their player pack status in the Markets page.
        </p>
        <Link href="/markets" className="btn-primary inline-block mt-4">
          Go to Markets →
        </Link>
      </main>
    </div>
  );
}
