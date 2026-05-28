import { Header } from "@/components/Header";
import { FanovoSaleComponent } from "@/components/FanovoSale";

export default function BuyPage() {
  return (
    <div className="min-h-screen">
      <Header />
      <main className="max-w-4xl mx-auto px-6 pt-10 pb-20">
        <FanovoSaleComponent />
      </main>
    </div>
  );
}
