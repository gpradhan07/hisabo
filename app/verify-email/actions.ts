"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { hostedConfig } from "@/lib/server/config";
import { idTokenFromCustomToken, sendConfirmationEmail } from "@/lib/server/email-auth";
import { adminAuth } from "@/lib/server/firebase";
import { allow } from "@/lib/server/rate-limit";
import { SESSION_COOKIE, createHostedSessionToken, sessionCookieOptions, verifySessionToken } from "@/lib/server/session";

export type VerifyState = { error?: string; notice?: string } | undefined;

async function pendingUser() {
  const session = await verifySessionToken((await cookies()).get(SESSION_COOKIE)?.value);
  const config = hostedConfig();
  if (session?.kind !== "hosted" || !config) redirect("/login");
  return { session, config };
}

/** Moves on once Firebase says the email is confirmed. `quiet`: checked automatically, so no message if not yet. */
export async function checkConfirmed(quiet = false): Promise<VerifyState> {
  const { session } = await pendingUser();
  const user = await adminAuth().getUser(session.uid);
  if (!user.emailVerified) {
    return quiet ? undefined : { error: "It isn't confirmed yet. Click the link in the email, then try again." };
  }
  (await cookies()).set(SESSION_COOKIE, await createHostedSessionToken({ ...session, emailVerified: true }), sessionCookieOptions);
  redirect(session.driveConnected ? "/" : "/connect-drive");
}

export async function resendConfirmation(): Promise<VerifyState> {
  const { session, config } = await pendingUser();
  if (!allow(`resend:${session.uid}`, 3, 10 * 60_000)) return { error: "We've sent a few already. Wait a few minutes, and check your spam folder." };

  // Firebase sends the email on behalf of a signed-in user, so sign in as them with a one-off token.
  const signedIn = await idTokenFromCustomToken(config.apiKey, await adminAuth().createCustomToken(session.uid));
  if (!signedIn.ok) return { error: signedIn.error };
  const sent = await sendConfirmationEmail(config.apiKey, signedIn.value.idToken, `${config.appUrl}/verify-email`);
  if (sent.ok) return { notice: `Sent again to ${session.email}.` };
  // Firebase spaces these emails out, so this is usually "too soon after the last one".
  if (sent.code === "TOO_MANY_ATTEMPTS_TRY_LATER") return { error: "We only just sent one. Check your spam folder, and give it a minute before asking for another." };
  return { error: sent.error };
}

/** Typo in the address: start sign-up again. */
export async function signUpWithAnotherEmail() {
  (await cookies()).delete(SESSION_COOKIE);
  redirect("/login?mode=signup");
}
