import "server-only";
import type { Auth, UserRecord } from "firebase-admin/auth";
import type { GoogleIdentity } from "./google-oauth";

/**
 * Who a Google account belongs to. One hisabo user can sign in with a password, with Google, or both;
 * Firebase Authentication holds the identities and these rules decide which user a Google sign-in opens.
 */

export interface AuthUser {
  uid: string;
  email?: string;
  emailVerified: boolean;
  hasPassword: boolean;
  /** the linked Google account, if any */
  googleSub?: string;
}

/** The few Firebase Authentication operations the rules need (a fake in tests). */
export interface AuthAdmin {
  byUid(uid: string): Promise<AuthUser | null>;
  byGoogleSub(sub: string): Promise<AuthUser | null>;
  byEmail(email: string): Promise<AuthUser | null>;
  create(input: { email: string; emailVerified: boolean; displayName?: string }): Promise<AuthUser>;
  linkGoogle(uid: string, google: GoogleIdentity): Promise<void>;
  unlinkGoogle(uid: string): Promise<void>;
  /** Google proved the address belongs to this person: drop the unconfirmed password, mark the email confirmed. */
  takeOver(uid: string): Promise<void>;
  /** Deletes the login (fine if it's already gone). */
  remove(uid: string): Promise<void>;
}

export type SignInMatch = { ok: true; uid: string; email: string } | { ok: false; reason: "google-email-unverified" };

/** Continue with Google: the existing user for this Google account or email, or a new one (project_arch.md §7.1). */
export async function matchGoogleSignIn(admin: AuthAdmin, google: GoogleIdentity): Promise<SignInMatch> {
  const linked = await admin.byGoogleSub(google.sub);
  if (linked) return { ok: true, uid: linked.uid, email: linked.email ?? google.email };

  const sameEmail = await admin.byEmail(google.email);
  if (sameEmail) {
    // Only an address Google has confirmed may open an existing account.
    if (!google.emailVerified) return { ok: false, reason: "google-email-unverified" };
    if (!sameEmail.emailVerified) await admin.takeOver(sameEmail.uid);
    // A user whose Drive is connected with another Google account keeps that link.
    if (!sameEmail.googleSub) await admin.linkGoogle(sameEmail.uid, google);
    return { ok: true, uid: sameEmail.uid, email: sameEmail.email ?? google.email };
  }

  const created = await admin.create({ email: google.email, emailVerified: google.emailVerified, displayName: google.name });
  await admin.linkGoogle(created.uid, google);
  return { ok: true, uid: created.uid, email: google.email };
}

export type LinkResult = { ok: true } | { ok: false; reason: "google-in-use" };

/** Connect Google Drive for a signed-in user. Connecting a different Google account replaces the old link. */
export async function linkGoogleToUser(admin: AuthAdmin, uid: string, google: GoogleIdentity): Promise<LinkResult> {
  const linked = await admin.byGoogleSub(google.sub);
  if (linked) return linked.uid === uid ? { ok: true } : { ok: false, reason: "google-in-use" };

  const user = await admin.byUid(uid);
  if (user?.googleSub) await admin.unlinkGoogle(uid);
  await admin.linkGoogle(uid, google);
  return { ok: true };
}

function toAuthUser(u: UserRecord): AuthUser {
  return {
    uid: u.uid,
    email: u.email,
    emailVerified: u.emailVerified,
    hasPassword: u.providerData.some((p) => p.providerId === "password"),
    googleSub: u.providerData.find((p) => p.providerId === "google.com")?.uid,
  };
}

async function orNull(lookup: Promise<UserRecord>): Promise<AuthUser | null> {
  try {
    return toAuthUser(await lookup);
  } catch (err) {
    if ((err as { code?: string }).code === "auth/user-not-found") return null;
    throw err;
  }
}

export function firebaseAuthAdmin(auth: Auth): AuthAdmin {
  return {
    byUid: (uid) => orNull(auth.getUser(uid)),
    byGoogleSub: (sub) => orNull(auth.getUserByProviderUid("google.com", sub)),
    byEmail: (email) => orNull(auth.getUserByEmail(email)),
    create: async (input) => toAuthUser(await auth.createUser(input)),
    linkGoogle: async (uid, g) => {
      await auth.updateUser(uid, { providerToLink: { providerId: "google.com", uid: g.sub, email: g.email, displayName: g.name } });
    },
    unlinkGoogle: async (uid) => {
      await auth.updateUser(uid, { providersToUnlink: ["google.com"] });
    },
    takeOver: async (uid) => {
      await auth.updateUser(uid, { providersToUnlink: ["password"], emailVerified: true });
    },
    remove: async (uid) => {
      try {
        await auth.deleteUser(uid);
      } catch (err) {
        if ((err as { code?: string }).code !== "auth/user-not-found") throw err;
      }
    },
  };
}
