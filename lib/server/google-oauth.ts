import "server-only";
import { createHash, randomBytes } from "node:crypto";
import { createRemoteJWKSet, jwtVerify } from "jose";

/**
 * Google OAuth for web servers: hisabo redirects to Google's page and Google redirects back with a code,
 * which the server swaps for tokens. Asking for `offline` access gives a refresh token, so hisabo can
 * write to the user's sheet when they aren't on the page (the iPhone Shortcut).
 */

export const DRIVE_FILE_SCOPE = "https://www.googleapis.com/auth/drive.file";
export const SCOPES = ["openid", "email", "profile", DRIVE_FILE_SCOPE];

const AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth";
const TOKEN_URL = "https://oauth2.googleapis.com/token";
const REVOKE_URL = "https://oauth2.googleapis.com/revoke";
const googleKeys = createRemoteJWKSet(new URL("https://www.googleapis.com/oauth2/v3/certs"));

export const redirectUri = (appUrl: string) => `${appUrl}/api/auth/google/callback`;

const random = () => randomBytes(32).toString("base64url");

/** A fresh state value and PKCE pair for one sign-in attempt. */
export function newAttempt() {
  const verifier = random();
  return { state: random(), verifier, challenge: createHash("sha256").update(verifier).digest("base64url") };
}

export function authorizationUrl(opts: {
  clientId: string;
  appUrl: string;
  state: string;
  challenge: string;
  /** `consent` forces Google to issue a new refresh token */
  prompt: "select_account" | "consent";
  loginHint?: string;
}): string {
  const params = new URLSearchParams({
    client_id: opts.clientId,
    redirect_uri: redirectUri(opts.appUrl),
    response_type: "code",
    scope: SCOPES.join(" "),
    access_type: "offline",
    include_granted_scopes: "true",
    state: opts.state,
    code_challenge: opts.challenge,
    code_challenge_method: "S256",
    prompt: opts.prompt,
  });
  if (opts.loginHint) params.set("login_hint", opts.loginHint);
  return `${AUTH_URL}?${params}`;
}

export interface GoogleTokens {
  accessToken: string;
  /** milliseconds since epoch */
  expiresAt: number;
  /** only on the first consent, or when `prompt=consent` was used */
  refreshToken?: string;
  scopes: string[];
  idToken?: string;
}

export class GoogleTokenError extends Error {
  constructor(
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = "GoogleTokenError";
  }
}

async function tokenRequest(body: Record<string, string>, fetchImpl: typeof fetch): Promise<GoogleTokens> {
  let res: Response;
  try {
    res = await fetchImpl(TOKEN_URL, { method: "POST", body: new URLSearchParams(body), cache: "no-store", signal: AbortSignal.timeout(15_000) });
  } catch {
    throw new GoogleTokenError("network", "Couldn't reach Google.");
  }
  const json = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (!res.ok) throw new GoogleTokenError(String(json.error ?? res.status), String(json.error_description ?? json.error ?? "Google refused the request."));
  return {
    accessToken: String(json.access_token),
    expiresAt: Date.now() + Number(json.expires_in ?? 3600) * 1000,
    refreshToken: typeof json.refresh_token === "string" ? json.refresh_token : undefined,
    scopes: String(json.scope ?? "").split(" ").filter(Boolean),
    idToken: typeof json.id_token === "string" ? json.id_token : undefined,
  };
}

export function exchangeCode(
  opts: { code: string; verifier: string; clientId: string; clientSecret: string; appUrl: string },
  fetchImpl: typeof fetch = fetch,
) {
  return tokenRequest(
    {
      grant_type: "authorization_code",
      code: opts.code,
      code_verifier: opts.verifier,
      client_id: opts.clientId,
      client_secret: opts.clientSecret,
      redirect_uri: redirectUri(opts.appUrl),
    },
    fetchImpl,
  );
}

/** A new access token. Throws GoogleTokenError("invalid_grant") when the user removed hisabo's access. */
export function refreshAccessToken(opts: { refreshToken: string; clientId: string; clientSecret: string }, fetchImpl: typeof fetch = fetch) {
  return tokenRequest(
    { grant_type: "refresh_token", refresh_token: opts.refreshToken, client_id: opts.clientId, client_secret: opts.clientSecret },
    fetchImpl,
  );
}

/**
 * Ends hisabo's access to the Google account: revoking the refresh token revokes the whole grant, so hisabo leaves
 * the account's "Third-party apps" list. True when Google confirms.
 */
export async function revokeGrant(token: string, fetchImpl: typeof fetch = fetch): Promise<boolean> {
  try {
    const res = await fetchImpl(REVOKE_URL, { method: "POST", body: new URLSearchParams({ token }), cache: "no-store", signal: AbortSignal.timeout(15_000) });
    return res.ok;
  } catch {
    return false;
  }
}

export interface GoogleIdentity {
  /** Google's stable account ID */
  sub: string;
  email: string;
  emailVerified: boolean;
  name?: string;
}

export async function verifyIdToken(idToken: string, clientId: string): Promise<GoogleIdentity> {
  const { payload } = await jwtVerify(idToken, googleKeys, { audience: clientId, issuer: ["https://accounts.google.com", "accounts.google.com"] });
  if (typeof payload.sub !== "string" || typeof payload.email !== "string") throw new Error("Google didn't share an email address.");
  return {
    sub: payload.sub,
    email: payload.email.toLowerCase(),
    emailVerified: payload.email_verified === true,
    name: typeof payload.name === "string" ? payload.name : undefined,
  };
}
