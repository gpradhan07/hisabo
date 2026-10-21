import "server-only";
import { createHash } from "node:crypto";
import { SignJWT, jwtVerify } from "jose";

export const SESSION_COOKIE = "hisabo_session";
const MAX_AGE_SECONDS = 60 * 60 * 24 * 30; // 30 days

export const sessionCookieOptions = {
  httpOnly: true,
  secure: process.env.NODE_ENV === "production",
  sameSite: "lax" as const,
  path: "/",
  maxAge: MAX_AGE_SECONDS,
};

function secretKey(): Uint8Array | null {
  const secret = process.env.SESSION_SECRET ?? "";
  return secret.length >= 32 ? new TextEncoder().encode(secret) : null;
}

/** Changing the username or password in the environment signs everyone out. */
function credentialFingerprint() {
  return createHash("sha256")
    .update(`${process.env.DASHBOARD_USERNAME ?? ""}\0${process.env.DASHBOARD_PASSWORD ?? ""}`)
    .digest("base64url")
    .slice(0, 16);
}

export async function createSessionToken(username: string) {
  const key = secretKey();
  if (!key) throw new Error("SESSION_SECRET is not configured");
  return new SignJWT({ fp: credentialFingerprint() })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(username)
    .setIssuedAt()
    .setExpirationTime(`${MAX_AGE_SECONDS}s`)
    .sign(key);
}

export async function verifySessionToken(token: string | undefined): Promise<{ username: string } | null> {
  const key = secretKey();
  if (!token || !key) return null;
  try {
    const { payload } = await jwtVerify(token, key, { algorithms: ["HS256"] });
    if (payload.fp !== credentialFingerprint() || typeof payload.sub !== "string") return null;
    return { username: payload.sub };
  } catch {
    return null;
  }
}
