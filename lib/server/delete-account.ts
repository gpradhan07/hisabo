import "server-only";
import type { AuthAdmin } from "./accounts";
import type { HostedConfig } from "./config";
import { decrypt } from "./crypto";
import { revokeGrant } from "./google-oauth";
import type { LiveSignals } from "./live";
import type { PhoneKeyRepo } from "./phone-keys";
import type { AccessTokenSource } from "./store/google-sheets";
import { accessTokenSource, forgetAccessToken, type UserRepo } from "./users";

const DRIVE_FILES = "https://www.googleapis.com/drive/v3/files";

export interface DeleteAccountDeps {
  config: HostedConfig;
  users: UserRepo;
  phoneKeys: PhoneKeyRepo;
  admin: AuthAdmin;
  signals?: LiveSignals;
  fetch?: typeof fetch;
}

/**
 * "Delete my account": the spreadsheet goes to the Drive trash (Google empties it after 30 days), hisabo's Google
 * access is revoked, and the iPhone keys, `users/{uid}` and the login are deleted, so signing up again starts fresh.
 * The Google steps are best effort (access may already be gone); hisabo's own records are always deleted.
 * `sheetRemoved` is false when the sheet couldn't be reached: the user is told to delete it in Drive.
 */
export async function deleteAccount(deps: DeleteAccountDeps, uid: string): Promise<{ sheetRemoved: boolean }> {
  const user = await deps.users.get(uid);
  let sheetRemoved = !user?.sheetId;
  if (user?.sheetId) sheetRemoved = await trashFile(user.sheetId, accessTokenSource(deps, uid, user), deps.fetch ?? fetch);
  // After the sheet: revoking first would leave no token to reach it with.
  if (user?.googleRefreshToken) {
    try {
      await revokeGrant(decrypt(user.googleRefreshToken, deps.config.tokenKey), deps.fetch);
    } catch {
      // unreadable token: nothing hisabo can revoke
    }
  }

  for (const key of await deps.phoneKeys.listFor(uid)) await deps.phoneKeys.remove(key.id);
  await deps.users.remove(uid);
  await deps.signals?.remove(uid).catch(() => undefined);
  forgetAccessToken(uid);
  await deps.admin.remove(uid);
  return { sheetRemoved };
}

/** Moves a file hisabo created to the Drive trash. True when it's there, or already gone. */
async function trashFile(id: string, token: AccessTokenSource, fetchImpl: typeof fetch): Promise<boolean> {
  const send = async (t: string) =>
    fetchImpl(`${DRIVE_FILES}/${encodeURIComponent(id)}`, {
      method: "PATCH",
      headers: { Authorization: `Bearer ${t}`, "Content-Type": "application/json" },
      body: JSON.stringify({ trashed: true }),
      cache: "no-store",
      signal: AbortSignal.timeout(15_000),
    });
  try {
    let res = await send(await token());
    if (res.status === 401) res = await send(await token({ refresh: true }));
    return res.ok || res.status === 404;
  } catch {
    // Google access was already removed (no token), or Google is unreachable
    return false;
  }
}
