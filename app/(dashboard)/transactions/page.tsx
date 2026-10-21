import type { Metadata } from "next";
import { Suspense } from "react";
import { TransactionsView } from "@/components/views/transactions";

export const metadata: Metadata = { title: "Transactions" };

export default function TransactionsPage() {
  // The view reads ?category= from the URL, which needs a Suspense boundary.
  return (
    <Suspense>
      <TransactionsView />
    </Suspense>
  );
}
