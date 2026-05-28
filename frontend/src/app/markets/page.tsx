import { Header } from "@/components/Header";
import { Markets } from "@/components/Markets";

export default function MarketsPage() {
  return (
    <div className="min-h-screen">
      <Header />
      <main className="max-w-[1400px] mx-auto px-6 py-8">
        <Markets />
      </main>
    </div>
  );
}
