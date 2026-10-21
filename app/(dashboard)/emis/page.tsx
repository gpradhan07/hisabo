import type { Metadata } from "next";
import { EmisView } from "@/components/views/emis";

export const metadata: Metadata = { title: "EMIs" };

export default function EmisPage() {
  return <EmisView />;
}
