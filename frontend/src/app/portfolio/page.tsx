import { Header } from "@/components/Header";
import { Portfolio } from "@/components/Portfolio";

export default function PortfolioPage() {
  return (
    <div className="min-h-screen">
      <Header />
      <main className="max-w-[1000px] mx-auto px-6 py-8">
        <Portfolio />
      </main>
    </div>
  );
}
