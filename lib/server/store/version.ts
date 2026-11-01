import { createHash } from "node:crypto";
import type { SheetData } from "./types";

/** Short fingerprint of the data, so the dashboard can skip a download when nothing changed. */
export function dataVersion({ expenses, subscriptions, emis, emiPayments, investments, profile }: SheetData): string {
  return createHash("sha1").update(JSON.stringify([expenses, subscriptions, emis, emiPayments, investments, profile])).digest("base64url").slice(0, 16);
}
