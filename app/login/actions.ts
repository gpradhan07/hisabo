"use server";

import { createHash, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { hostedConfig, loginConfig } from "@/lib/server/config";
import { sendConfirmationEmail, sendPasswordResetEmail, signInWithEmail, signUpWithEmail } from "@/lib/server/email-auth";
import { adminAuth } from "@/lib/server/firebase";
import { hostedServices } from "@/lib/server/hosted";
import { allow, clientIp } from "@/lib/server/rate-limit";
import { SESSION_COOKIE, createHostedSessionToken, createSessionToken, sessionCookieOptions } from "@/lib/server/session";

export type LoginState = { error: string; username: string } | undefined;

/** Self-host mode: the single username and password from .env.local. */
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

// ─── Hosted mode: email accounts ──────────────────────────────

export type AuthFormState = { error?: string; notice?: string; email: string } | undefined;

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const TOO_MANY = "Too many attempts. Wait a few minutes and try again.";

function readForm(formData: FormData) {
  return { email: String(formData.get("email") ?? "").trim().toLowerCase(), password: String(formData.get("password") ?? "") };
}

function requireHosted() {
  const config = hostedConfig();
  if (!config) throw new Error("Email accounts need hosted mode (Firebase settings in the environment).");
  return config;
}

export async function emailSignUp(_prev: AuthFormState, formData: FormData): Promise<AuthFormState> {
  const config = requireHosted();
  const { email, password } = readForm(formData);
  if (!EMAIL_RE.test(email)) return { error: "Enter your email address.", email };
  if (password.length < 8) return { error: "Use a password of at least 8 characters.", email };
  if (password.length > 128) return { error: "Keep the password under 128 characters.", email };
  if (!allow(`signup:${await clientIp()}`, 5, 10 * 60_000)) return { error: TOO_MANY, email };

  const created = await signUpWithEmail(config.apiKey, email, password);
  if (!created.ok) return { error: created.error, email };
  // If this fails, the "Check your inbox" page can send it again.
  await sendConfirmationEmail(config.apiKey, created.value.idToken, `${config.appUrl}/verify-email`);

  const token = await createHostedSessionToken({ uid: created.value.uid, email, emailVerified: false, driveConnected: false });
  (await cookies()).set(SESSION_COOKIE, token, sessionCookieOptions);
  redirect("/verify-email");
}

export async function emailSignIn(_prev: AuthFormState, formData: FormData): Promise<AuthFormState> {
  const config = requireHosted();
  const { email, password } = readForm(formData);
  if (!EMAIL_RE.test(email) || !password) return { error: "Enter your email and password.", email };
  if (!allow(`signin:${await clientIp()}`, 10, 10 * 60_000)) return { error: TOO_MANY, email };

  const signedIn = await signInWithEmail(config.apiKey, email, password);
  if (!signedIn.ok) {
    await new Promise((r) => setTimeout(r, 500)); // slow down guessing
    return { error: signedIn.error, email };
  }

  const uid = signedIn.value.uid;
  const [user, doc] = await Promise.all([adminAuth().getUser(uid), hostedServices(config).users.get(uid)]);
  const session = {
    uid,
    email: user.email ?? email,
    emailVerified: user.emailVerified,
    driveConnected: doc?.driveStatus === "connected" && !!doc.sheetId,
  };
  (await cookies()).set(SESSION_COOKIE, await createHostedSessionToken(session), sessionCookieOptions);
  redirect(!session.emailVerified ? "/verify-email" : !session.driveConnected ? "/connect-drive" : safeNext(formData.get("next")));
}

export async function requestPasswordReset(_prev: AuthFormState, formData: FormData): Promise<AuthFormState> {
  const config = requireHosted();
  const { email } = readForm(formData);
  if (!EMAIL_RE.test(email)) return { error: "Enter your email address.", email };
  if (!allow(`reset:${await clientIp()}`, 5, 10 * 60_000)) return { error: TOO_MANY, email };

  const sent = await sendPasswordResetEmail(config.apiKey, email, `${config.appUrl}/login`);
  // Same answer whether or not the account exists, so this form can't be used to find out who has one.
  if (!sent.ok && sent.code !== "EMAIL_NOT_FOUND") return { error: sent.error, email };
  return { notice: `If ${email} has a hisabo password, a reset link is on its way. Check your inbox.`, email };
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
