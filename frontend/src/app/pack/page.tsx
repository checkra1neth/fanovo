import { Header } from "@/components/Header";
import { PackOpener } from "@/components/PackOpener";

export default function PackPage() {
  return (
    <div className="min-h-screen">
      <Header />
      <main className="max-w-[1200px] mx-auto px-6 py-8">
        <PackOpener />
      </main>
    </div>
  );
}
