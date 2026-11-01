"use server";

import { cookies } from "next/headers";
import { hostedConfig } from "@/lib/server/config";
import { hostedServices } from "@/lib/server/hosted";
import { MAX_ACTIVE_KEYS, activeKeys, newPhoneKey, revokeKey, setupCode, type PhoneKeySummary } from "@/lib/server/phone-keys";
import { allow } from "@/lib/server/rate-limit";
import { SESSION_COOKIE, verifySessionToken } from "@/lib/server/session";

const EXPIRED = "Your session has expired. Please sign in again.";

async function signedInUser() {
  const session = await verifySessionToken((await cookies()).get(SESSION_COOKIE)?.value);
  const config = hostedConfig();
  if (!config || session?.kind !== "hosted" || !session.driveConnected) return null;
  return { uid: session.uid, config, phoneKeys: hostedServices(config).phoneKeys };
}

export type NewPairing =
  | {
      ok: true;
      key: PhoneKeySummary;
      /** JSON with the ingest address and the key; shown once */
      setupCode: string;
    }
  | { ok: false; error: string };

/** Creates a phone key. It is shown once (for the Shortcut to keep) and never stored. */
export async function createPairing(label: string): Promise<NewPairing> {
  const user = await signedInUser();
  if (!user) return { ok: false, error: EXPIRED };
  if (!allow(`pair:${user.uid}`, 10, 10 * 60_000)) return { ok: false, error: "That's a lot of new keys. Wait a few minutes and try again." };
  if ((await activeKeys(user.phoneKeys, user.uid)).length >= MAX_ACTIVE_KEYS) {
    return { ok: false, error: `You have ${MAX_ACTIVE_KEYS} paired iPhones. Remove one before adding another.` };
  }

  const name = String(label ?? "").trim().replace(/\s+/g, " ").slice(0, 40) || "iPhone";
  const { key, id } = newPhoneKey();
  const createdAt = Date.now();
  await user.phoneKeys.create(id, { uid: user.uid, label: name, createdAt });

  return { ok: true, key: { id, label: name, createdAt }, setupCode: setupCode(user.config.appUrl, key) };
}

/** Removes a paired iPhone: its key stops working on the next request. */
export async function revokePairing(id: string): Promise<{ ok: true } | { ok: false; error: string }> {
  const user = await signedInUser();
  if (!user) return { ok: false, error: EXPIRED };
  return (await revokeKey(user.phoneKeys, user.uid, String(id))) ? { ok: true } : { ok: false, error: "That iPhone isn't paired with your account." };
}
