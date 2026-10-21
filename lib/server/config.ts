import "server-only";
import type { ClientConfig, RealtimeConfig } from "@/lib/types";

const PLACEHOLDER_PASSWORD = "change-me";

export function sheetConfig() {
  return {
    url: process.env.APPS_SCRIPT_URL?.trim() ?? "",
    key: process.env.DASHBOARD_KEY?.trim() ?? "",
  };
}

/** Settings the browser is allowed to see. Never put secrets here. */
export function clientConfig(): ClientConfig {
  const budget = Number(process.env.MONTHLY_BUDGET);
  return {
    currency: process.env.CURRENCY?.trim() || "INR",
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
