import { Header } from "@/components/Header";
import { Tokenomics } from "@/components/Tokenomics";

export default function TokenomicsPage() {
  return (
    <div className="min-h-screen">
      <Header />
      <main className="max-w-[1200px] mx-auto px-6 py-8">
        <Tokenomics />
      </main>
    </div>
  );
}
