import type { Metadata } from "next";
import { SubscriptionsView } from "@/components/views/subscriptions";

export const metadata: Metadata = { title: "Subscriptions" };

export default function SubscriptionsPage() {
  return <SubscriptionsView />;
}
