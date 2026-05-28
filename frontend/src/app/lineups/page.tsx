import { Header } from "@/components/Header";
import { Lineups } from "@/components/Lineups";

export default function LineupsPage() {
  return (
    <div className="min-h-screen">
      <Header />
      <main className="max-w-[1200px] mx-auto px-6 py-8">
        <Lineups />
      </main>
    </div>
  );
}
