import "server-only";
import { createHash } from "node:crypto";
import { SignJWT, jwtVerify, type JWTPayload } from "jose";
import { isHosted } from "./config";

export const SESSION_COOKIE = "hisabo_session";
const MAX_AGE_SECONDS = 60 * 60 * 24 * 30; // 30 days

export const sessionCookieOptions = {
  httpOnly: true,
  secure: process.env.NODE_ENV === "production",
  sameSite: "lax" as const,
  path: "/",
  maxAge: MAX_AGE_SECONDS,
};

/** Self-host mode: the single user from .env.local. */
export type SelfHostSession = { kind: "selfhost"; username: string };

/** Hosted mode: a Firebase user, and how far through sign-up they are. */
export type HostedSession = {
  kind: "hosted";
  uid: string;
  email: string;
  /** email confirmed (always true for Google sign-in) */
  emailVerified: boolean;
  /** Google Drive connected and the spreadsheet exists */
  driveConnected: boolean;
};

export type Session = SelfHostSession | HostedSession;

function secretKey(): Uint8Array | null {
  const secret = process.env.SESSION_SECRET ?? "";
  return secret.length >= 32 ? new TextEncoder().encode(secret) : null;
}

function requireKey() {
  const key = secretKey();
  if (!key) throw new Error("SESSION_SECRET is not configured");
  return key;
}

/** Changing the username or password in the environment signs everyone out. */
function credentialFingerprint() {
  return createHash("sha256")
    .update(`${process.env.DASHBOARD_USERNAME ?? ""}\0${process.env.DASHBOARD_PASSWORD ?? ""}`)
    .digest("base64url")
    .slice(0, 16);
}

export async function createSessionToken(username: string) {
  return new SignJWT({ fp: credentialFingerprint() })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(username)
    .setIssuedAt()
    .setExpirationTime(`${MAX_AGE_SECONDS}s`)
    .sign(requireKey());
}

export async function createHostedSessionToken(s: Omit<HostedSession, "kind">) {
  return new SignJWT({ em: s.email, ev: s.emailVerified, dr: s.driveConnected })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(s.uid)
    .setAudience("session")
    .setIssuedAt()
    .setExpirationTime(`${MAX_AGE_SECONDS}s`)
    .sign(requireKey());
}

/** A session from the other mode (say, a self-host cookie after switching to hosted) counts as signed out. */
export async function verifySessionToken(token: string | undefined): Promise<Session | null> {
  const key = secretKey();
  if (!token || !key) return null;
  try {
    const { payload } = await jwtVerify(token, key, { algorithms: ["HS256"] });
    if (typeof payload.sub !== "string") return null;
    if (isHosted()) {
      if (payload.aud !== "session" || typeof payload.em !== "string") return null;
      return { kind: "hosted", uid: payload.sub, email: payload.em, emailVerified: payload.ev === true, driveConnected: payload.dr === true };
    }
    if (payload.fp !== credentialFingerprint()) return null;
    return { kind: "selfhost", username: payload.sub };
  } catch {
    return null;
  }
}

/** Short-lived signed values that aren't sessions, such as the Google sign-in state. */
export async function signShortLived(audience: string, claims: JWTPayload, seconds: number) {
  return new SignJWT(claims).setProtectedHeader({ alg: "HS256" }).setAudience(audience).setIssuedAt().setExpirationTime(`${seconds}s`).sign(requireKey());
}

export async function verifyShortLived(audience: string, token: string | undefined): Promise<JWTPayload | null> {
  const key = secretKey();
  if (!token || !key) return null;
  try {
    return (await jwtVerify(token, key, { algorithms: ["HS256"], audience })).payload;
  } catch {
    return null;
  }
}

/** The name shown in the app for this session. */
export const sessionLabel = (s: Session) => (s.kind === "hosted" ? s.email : s.username);
