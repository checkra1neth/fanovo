import { Header } from "@/components/Header";
import { TradePanel } from "@/components/TradePanel";

export default async function TradePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return (
    <div className="min-h-screen">
      <Header />
      <main className="max-w-[600px] mx-auto px-6 py-8">
        <TradePanel countryId={Number(id)} />
      </main>
    </div>
  );
}
