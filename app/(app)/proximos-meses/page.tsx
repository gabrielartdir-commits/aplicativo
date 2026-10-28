import type { Metadata } from "next";
import { ForecastView } from "@/features/forecast";

export const metadata: Metadata = { title: "Próximos meses" };

export default function ProximosMesesPage() {
  return <ForecastView />;
}
