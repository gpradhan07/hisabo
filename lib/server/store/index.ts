import "server-only";
import { hostedConfig, sheetConfig } from "../config";
import { hostedServices } from "../hosted";
import type { Session } from "../session";
import { accessTokenSource } from "../users";
import { AppsScriptStore } from "./apps-script";
import { demoStore } from "./demo";
import { GoogleSheetsStore } from "./google-sheets";
import type { Store, StoreErrorCode } from "./types";

export type { LoadResult, NewEntry, RowRef, Store, WriteResult } from "./types";

export type StoreLookup =
  | { ok: true; store: Store; /** hosted: the Google account holding the sheet */ sheetOwner?: string; /** hosted: the sheet in Google Sheets */ sheetUrl?: string }
  | { ok: false; status: 409; code: "connect-drive"; error: string };

const CONNECT_DRIVE = { ok: false, status: 409, code: "connect-drive", error: "Connect Google Drive to continue." } as const;

/**
 * The signed-in user's store. Self-host mode: one Apps Script sheet, or demo data until it's configured.
 * Hosted mode: the user's own spreadsheet, once Google Drive is connected.
 */
export async function storeFor(session: Session): Promise<StoreLookup> {
  if (session.kind === "selfhost") {
    const { url, key } = sheetConfig();
    return { ok: true, store: url ? new AppsScriptStore(url, key) : demoStore };
  }
  return storeForUser(session.uid);
}

/** Hosted mode: a user's spreadsheet by user ID (the Shortcut has a phone key, not a session). */
export async function storeForUser(uid: string): Promise<StoreLookup> {
  const config = hostedConfig();
  if (!config) return CONNECT_DRIVE;
  const { users } = hostedServices(config);
  const user = await users.get(uid);
  if (!user?.sheetId || user.driveStatus !== "connected") return CONNECT_DRIVE;
  return {
    ok: true,
    store: new GoogleSheetsStore({ spreadsheetId: user.sheetId, accessToken: accessTokenSource({ users, config }, uid, user) }),
    sheetOwner: user.googleEmail,
    sheetUrl: `https://docs.google.com/spreadsheets/d/${user.sheetId}/edit`,
  };
}

/** True for failures that only reconnecting Google Drive can fix. */
export const needsReconnect = (code: StoreErrorCode | undefined) => code === "reauth" || code === "sheet-missing";

/** Remember that this user has to connect Google Drive again (shown the next time they sign in). */
export async function markDriveLost(session: Session | { kind: "hosted"; uid: string }) {
  const config = hostedConfig();
  if (session.kind !== "hosted" || !config) return;
  await hostedServices(config).users.save(session.uid, { driveStatus: "needs-reconnect" });
}
