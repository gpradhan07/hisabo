import "server-only";
import type { Firestore } from "firebase-admin/firestore";
import type { HostedConfig } from "./config";
import { decrypt, encrypt } from "./crypto";
import { GoogleTokenError, refreshAccessToken } from "./google-oauth";
import { ReauthRequiredError, type AccessTokenSource } from "./store/google-sheets";

/** `users/{uid}` in Firestore, created when Google Drive is first connected. Server-only (rules deny browsers). */
export interface UserDoc {
  googleSub: string;
  /** the Google account that holds the spreadsheet, shown in the dashboard */
  googleEmail: string;
  driveStatus: "connected" | "needs-reconnect";
  sheetId?: string;
  /** AES-256-GCM, see crypto.ts */
  googleRefreshToken: string;
  googleAccessToken?: string;
  /** ms since epoch */
  googleAccessExpires?: number;
  createdAt: number;
  updatedAt: number;
}

export interface UserRepo {
  get(uid: string): Promise<UserDoc | null>;
  /** Merges the fields into the document, creating it if needed. */
  save(uid: string, fields: Partial<UserDoc>): Promise<void>;
  remove(uid: string): Promise<void>;
}

export function firestoreUsers(db: Firestore): UserRepo {
  const ref = (uid: string) => db.collection("users").doc(uid);
  return {
    async get(uid) {
      const snap = await ref(uid).get();
      return snap.exists ? (snap.data() as UserDoc) : null;
    },
    async save(uid, fields) {
      await ref(uid).set({ ...fields, updatedAt: Date.now() }, { merge: true });
    },
    async remove(uid) {
      await ref(uid).delete();
    },
  };
}

// Access tokens live about an hour. Keeping them in memory saves a Firestore read and write per request.
const memory = (globalThis as typeof globalThis & { __hisaboTokens?: Map<string, { token: string; expiresAt: number }> }).__hisaboTokens ??=
  new Map();
const SAFETY_MS = 60_000;

export function forgetAccessToken(uid: string) {
  memory.delete(uid);
}

/**
 * A Google access token for this user's Sheets calls: from memory, then Firestore, then a refresh. A dead
 * refresh token marks Drive as needing reconnection and throws ReauthRequiredError.
 */
export function accessTokenSource(
  deps: { users: UserRepo; config: HostedConfig; fetch?: typeof fetch },
  uid: string,
  user: UserDoc,
): AccessTokenSource {
  const { users, config } = deps;
  return async ({ refresh = false } = {}) => {
    const now = Date.now();
    if (!refresh) {
      const cached = memory.get(uid);
      if (cached && cached.expiresAt - SAFETY_MS > now) return cached.token;
      if (user.googleAccessToken && (user.googleAccessExpires ?? 0) - SAFETY_MS > now) {
        const token = decrypt(user.googleAccessToken, config.tokenKey);
        memory.set(uid, { token, expiresAt: user.googleAccessExpires! });
        return token;
      }
    }

    let fresh;
    try {
      fresh = await refreshAccessToken(
        { refreshToken: decrypt(user.googleRefreshToken, config.tokenKey), clientId: config.googleClientId, clientSecret: config.googleClientSecret },
        deps.fetch,
      );
    } catch (err) {
      if (err instanceof GoogleTokenError && err.code === "invalid_grant") {
        memory.delete(uid);
        await users.save(uid, { driveStatus: "needs-reconnect" });
        throw new ReauthRequiredError();
      }
      throw err;
    }
    memory.set(uid, { token: fresh.accessToken, expiresAt: fresh.expiresAt });
    user.googleAccessToken = encrypt(fresh.accessToken, config.tokenKey);
    user.googleAccessExpires = fresh.expiresAt;
    await users.save(uid, { googleAccessToken: user.googleAccessToken, googleAccessExpires: fresh.expiresAt });
    return fresh.accessToken;
  };
}
