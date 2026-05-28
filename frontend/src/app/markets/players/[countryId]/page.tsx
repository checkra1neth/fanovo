import { COUNTRIES } from "@/lib/contracts";
import CountryPlayersClient from "@/components/CountryPlayersClient";

export function generateStaticParams() {
  return COUNTRIES.map((country) => ({
    countryId: country.id.toString(),
  }));
}

export default async function CountryPlayersPage({ params }: { params: Promise<{ countryId: string }> }) {
  const { countryId } = await params;
  return <CountryPlayersClient countryId={Number(countryId)} />;
}
