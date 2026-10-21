import "server-only";
import { createHash } from "node:crypto";
import { normalizeProfile } from "@/lib/profile";
import type { ApiResponse, Profile } from "@/lib/types";
import { sheetConfig } from "./config";

export type SheetResult =
  | {
      ok: true;
      demo: boolean;
      version: string;
      generatedAt: string;
      expenses: ApiResponse["expenses"];
      emis: ApiResponse["emis"];
      investments: ApiResponse["investments"];
      profile: Profile | null;
    }
  | { ok: false; status: number; error: string };

/** Reads the sheet through the Apps Script doGet. The key never leaves the server. */
export async function loadSheet(): Promise<SheetResult> {
  const { url, key } = sheetConfig();

  // No sheet configured yet → the client renders built-in demo data.
  if (!url) return { ok: true, demo: true, version: "demo", generatedAt: new Date().toISOString(), expenses: [], emis: [], investments: [], profile: null };
  if (!key) return { ok: false, status: 500, error: "DASHBOARD_KEY is missing from your environment." };

  let target: URL;
  try {
    target = new URL(url);
  } catch {
    return { ok: false, status: 500, error: "APPS_SCRIPT_URL is not a valid URL." };
  }
  target.searchParams.set("key", key);

  let text: string;
  try {
    const res = await fetch(target, { cache: "no-store", redirect: "follow", signal: AbortSignal.timeout(25_000) });
    if (!res.ok) return { ok: false, status: 502, error: `Google Apps Script responded with ${res.status}.` };
    text = await res.text();
  } catch (err) {
    const timedOut = (err as Error).name === "TimeoutError";
    return { ok: false, status: 504, error: timedOut ? "Google Apps Script took too long to respond." : "Couldn't reach Google Apps Script." };
  }

  let json: ApiResponse;
  try {
    json = JSON.parse(text);
  } catch {
    return {
      ok: false,
      status: 502,
      error: "Apps Script didn't return data. Deploy a new version of Code.gs (with doGet) and check the URL.",
    };
  }
  if (!json.ok) {
    const error = json.error === "Unauthorized" ? "DASHBOARD_KEY doesn't match the key in Apps Script." : (json.error ?? "Unknown error");
    return { ok: false, status: 502, error };
  }

  const expenses = json.expenses ?? [];
  const emis = json.emis ?? [];
  const investments = json.investments ?? [];
  const profile = normalizeProfile(json.profile);
  const version = createHash("sha1").update(JSON.stringify([expenses, emis, investments, profile])).digest("base64url").slice(0, 16);
  return { ok: true, demo: false, version, generatedAt: json.generatedAt ?? new Date().toISOString(), expenses, emis, investments, profile };
}
