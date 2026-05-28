import { Header } from "@/components/Header";
import { Predict } from "@/components/Predict";

export default function PredictPage() {
  return (
    <div className="min-h-screen">
      <Header />
      <main className="max-w-[1400px] mx-auto px-6 py-8">
        <Predict />
      </main>
    </div>
  );
}
