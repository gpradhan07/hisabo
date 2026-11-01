import "server-only";
import type { ClientConfig, RealtimeConfig } from "@/lib/types";

const PLACEHOLDER_PASSWORD = "change-me";

/**
 * Hosted mode (v2): every user signs in (Google, or email + password) and gets a spreadsheet in their own
 * Drive. It's on when Firebase and the Google OAuth client are configured; otherwise the app runs in
 * self-host mode (one Apps Script sheet, the .env login).
 */
export function hostedConfig() {
  const c = {
    projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID?.trim() ?? "",
    apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY?.trim() ?? "",
    clientEmail: process.env.FIREBASE_CLIENT_EMAIL?.trim() ?? "",
    privateKey: (process.env.FIREBASE_PRIVATE_KEY ?? "").replace(/\\n/g, "\n"),
    googleClientId: process.env.GOOGLE_CLIENT_ID?.trim() ?? "",
    googleClientSecret: process.env.GOOGLE_CLIENT_SECRET?.trim() ?? "",
    tokenKey: process.env.TOKEN_ENCRYPTION_KEY?.trim() ?? "",
    appUrl: (process.env.NEXT_PUBLIC_APP_URL?.trim() || "http://localhost:3000").replace(/\/+$/, ""),
  };
  const required = [c.projectId, c.apiKey, c.clientEmail, c.privateKey, c.googleClientId, c.googleClientSecret, c.tokenKey];
  return required.every(Boolean) ? c : null;
}

export type HostedConfig = NonNullable<ReturnType<typeof hostedConfig>>;

export const isHosted = () => hostedConfig() !== null;

/** Where "Get the Shortcut" goes: the iCloud link when it's set, else the signed file in public/ (built for hisabo-app.netlify.app). */
export const shortcutUrl = () => process.env.SHORTCUT_ICLOUD_URL?.trim() || "/hisabo.shortcut";

export function sheetConfig() {
  return {
    url: process.env.APPS_SCRIPT_URL?.trim() ?? "",
    key: process.env.DASHBOARD_KEY?.trim() ?? "",
  };
}

/** Settings the browser is allowed to see. Never put secrets here. */
export function clientConfig(): ClientConfig {
  const currency = process.env.CURRENCY?.trim() || "INR";
  // Hosted mode: the budget comes from each user's profile, and live updates come through Firebase, not Pusher.
  const hosted = hostedConfig();
  if (hosted) return { currency, hosted: true, monthlyBudget: null, realtime: null, live: { apiKey: hosted.apiKey, projectId: hosted.projectId } };
  const budget = Number(process.env.MONTHLY_BUDGET);
  return {
    currency,
    hosted: false,
    monthlyBudget: Number.isFinite(budget) && budget > 0 ? budget : null,
    realtime: realtimeConfig(),
  };
}

function realtimeConfig(): RealtimeConfig | null {
  const key = process.env.PUSHER_KEY?.trim();
  const cluster = process.env.PUSHER_CLUSTER?.trim();
  const channel = process.env.PUSHER_CHANNEL?.trim();
  if (!key || !cluster || !channel) return null;
  const host = process.env.PUSHER_HOST?.trim();
  const port = Number(process.env.PUSHER_PORT);
  return { key, cluster, channel, ...(host ? { host } : {}), ...(port > 0 ? { port } : {}) };
}

/** Returns the login credentials, or a message explaining what's missing in .env.local */
export function loginConfig(): { ok: true; username: string; password: string } | { ok: false; error: string } {
  const username = process.env.DASHBOARD_USERNAME?.trim() ?? "";
  const password = process.env.DASHBOARD_PASSWORD ?? "";
  const secret = process.env.SESSION_SECRET ?? "";

  if (!username || !password) return { ok: false, error: "Set DASHBOARD_USERNAME and DASHBOARD_PASSWORD in your environment." };
  if (secret.length < 32) return { ok: false, error: "Set SESSION_SECRET (32+ characters) in your environment." };
  if (process.env.NODE_ENV === "production" && (password === PLACEHOLDER_PASSWORD || password.length < 8)) {
    return { ok: false, error: "Choose a real DASHBOARD_PASSWORD (8+ characters) before deploying." };
  }
  return { ok: true, username, password };
}
