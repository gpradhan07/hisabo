"use server";

import { createHash, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { loginConfig } from "@/lib/server/config";
import { SESSION_COOKIE, createSessionToken, sessionCookieOptions } from "@/lib/server/session";

export type LoginState = { error: string; username: string } | undefined;

export async function login(_prev: LoginState, formData: FormData): Promise<LoginState> {
  const username = String(formData.get("username") ?? "").trim();
  const password = String(formData.get("password") ?? "");

  const cfg = loginConfig();
  if (!cfg.ok) return { error: cfg.error, username };

  // Compare both fields every time so the response time doesn't reveal which one was wrong.
  const userOk = safeEqual(username, cfg.username);
  const passOk = safeEqual(password, cfg.password);
  if (!userOk || !passOk) {
    await new Promise((r) => setTimeout(r, 700)); // slow down guessing
    return { error: "Incorrect username or password.", username };
  }

  (await cookies()).set(SESSION_COOKIE, await createSessionToken(cfg.username), sessionCookieOptions);
  redirect(safeNext(formData.get("next")));
}

export async function logout() {
  (await cookies()).delete(SESSION_COOKIE);
  redirect("/login");
}

function safeEqual(a: string, b: string) {
  const ha = createHash("sha256").update(a).digest();
  const hb = createHash("sha256").update(b).digest();
  return timingSafeEqual(ha, hb);
}

/** Only allow redirects back into this app. */
function safeNext(value: FormDataEntryValue | null) {
  const next = typeof value === "string" ? value : "";
  return next.startsWith("/") && !next.startsWith("//") && !next.startsWith("/login") ? next : "/";
}
