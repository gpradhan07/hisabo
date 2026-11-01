import "server-only";
import { linkGoogleToUser, matchGoogleSignIn, type AuthAdmin } from "./accounts";
import type { HostedConfig } from "./config";
import { decrypt, encrypt } from "./crypto";
import { DRIVE_FILE_SCOPE, exchangeCode, verifyIdToken as verifyGoogleIdToken, type GoogleIdentity } from "./google-oauth";
import type { HostedSession } from "./session";
import { checkSpreadsheet, createSpreadsheet } from "./store/google-sheets";
import { forgetAccessToken, type UserDoc, type UserRepo } from "./users";

/** What the start route remembers (signed, in a short-lived cookie) while the user is on Google's page. */
export interface Attempt {
  state: string;
  verifier: string;
  /** signin: Continue with Google. connect: Connect Google Drive for a signed-in user. */
  intent: "signin" | "connect";
  /** the browser's time zone, for a new spreadsheet */
  tz: string;
  /** the signed-in user, for connect */
  uid?: string;
  /** whether this attempt already forced Google's consent screen */
  consent: boolean;
}

export type FailureReason = "cancelled" | "failed" | "google-email-unverified" | "google-in-use" | "drive-not-granted" | "no-email";

export type CallbackOutcome =
  | { kind: "signed-in"; session: Omit<HostedSession, "kind"> }
  /** Google sent no refresh token and hisabo has none: go back with prompt=consent */
  | { kind: "need-consent"; loginHint: string }
  /** `session` is set when the user is signed in but Drive isn't connected */
  | { kind: "failed"; reason: FailureReason; session?: Omit<HostedSession, "kind"> };

export interface SignInDeps {
  config: HostedConfig;
  admin: AuthAdmin;
  users: UserRepo;
  fetch?: typeof fetch;
  verifyIdToken?: (idToken: string, clientId: string) => Promise<GoogleIdentity>;
}

/** Handles Google's redirect back: who the user is, their Drive access, their spreadsheet. */
export async function completeGoogleSignIn(deps: SignInDeps, attempt: Attempt, params: { code?: string | null; error?: string | null }): Promise<CallbackOutcome> {
  const { config, admin, users } = deps;
  if (params.error) return { kind: "failed", reason: params.error === "access_denied" ? "cancelled" : "failed" };
  if (!params.code) return { kind: "failed", reason: "failed" };

  let tokens, google: GoogleIdentity;
  try {
    tokens = await exchangeCode(
      { code: params.code, verifier: attempt.verifier, clientId: config.googleClientId, clientSecret: config.googleClientSecret, appUrl: config.appUrl },
      deps.fetch,
    );
    if (!tokens.idToken) return { kind: "failed", reason: "failed" };
    google = await (deps.verifyIdToken ?? verifyGoogleIdToken)(tokens.idToken, config.googleClientId);
  } catch {
    return { kind: "failed", reason: "failed" };
  }

  // Whose account is this?
  let uid: string, email: string;
  if (attempt.intent === "connect") {
    if (!attempt.uid) return { kind: "failed", reason: "failed" };
    const linked = await linkGoogleToUser(admin, attempt.uid, google);
    if (!linked.ok) return { kind: "failed", reason: linked.reason };
    const user = await admin.byUid(attempt.uid);
    if (!user?.email) return { kind: "failed", reason: "no-email" };
    uid = attempt.uid;
    email = user.email;
  } else {
    const match = await matchGoogleSignIn(admin, google);
    if (!match.ok) return { kind: "failed", reason: match.reason };
    ({ uid, email } = match);
  }

  const existing = await users.get(uid);
  const signedIn = (driveConnected: boolean) => ({ uid, email, emailVerified: true, driveConnected });

  // Signing in with a second Google account must not move a working Drive connection.
  if (attempt.intent === "signin" && existing?.driveStatus === "connected" && existing.sheetId && existing.googleSub !== google.sub) {
    return { kind: "signed-in", session: signedIn(true) };
  }

  if (!tokens.scopes.includes(DRIVE_FILE_SCOPE)) {
    const stillConnected = existing?.driveStatus === "connected" && !!existing.sheetId && existing.googleSub === google.sub;
    return stillConnected ? { kind: "signed-in", session: signedIn(true) } : { kind: "failed", reason: "drive-not-granted", session: signedIn(false) };
  }

  const sameAccount = existing?.googleSub === google.sub;
  const refreshToken = tokens.refreshToken ?? (sameAccount && existing ? decrypt(existing.googleRefreshToken, config.tokenKey) : undefined);
  if (!refreshToken) {
    return attempt.consent ? { kind: "failed", reason: "failed", session: signedIn(false) } : { kind: "need-consent", loginHint: google.email };
  }

  // Keep the user's spreadsheet if this Google account can still open it; otherwise make a new one.
  const accessToken = async () => tokens.accessToken;
  let sheetId = sameAccount ? existing?.sheetId : undefined;
  if (sheetId) {
    const check = await checkSpreadsheet({ spreadsheetId: sheetId, accessToken, fetch: deps.fetch });
    if (!check.ok) {
      if (check.code !== "sheet-missing") return { kind: "failed", reason: "failed", session: signedIn(false) };
      sheetId = undefined;
    }
  }
  if (!sheetId) {
    const created = await createSpreadsheet({ accessToken, timeZone: attempt.tz, fetch: deps.fetch });
    if (!created.ok) return { kind: "failed", reason: "failed", session: signedIn(false) };
    sheetId = created.spreadsheetId;
  }

  const now = Date.now();
  const doc: Partial<UserDoc> = {
    googleSub: google.sub,
    googleEmail: google.email,
    driveStatus: "connected",
    sheetId,
    googleRefreshToken: encrypt(refreshToken, config.tokenKey),
    googleAccessToken: encrypt(tokens.accessToken, config.tokenKey),
    googleAccessExpires: tokens.expiresAt,
    ...(existing ? {} : { createdAt: now }),
  };
  await users.save(uid, doc);
  forgetAccessToken(uid);
  return { kind: "signed-in", session: signedIn(true) };
}
