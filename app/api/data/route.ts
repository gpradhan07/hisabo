import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { clientConfig } from "@/lib/server/config";
import { SESSION_COOKIE, createHostedSessionToken, sessionCookieOptions, sessionLabel, verifySessionToken, type Session } from "@/lib/server/session";
import { markDriveLost, needsReconnect, storeFor } from "@/lib/server/store";

const headers = { "Cache-Control": "private, no-store" };

/** Google Drive access is gone: say so, and clear "Drive connected" from the session so pages send the user to reconnect. */
async function connectDrive(session: Session, error: string) {
  const res = NextResponse.json({ ok: false, code: "connect-drive", error }, { status: 409, headers });
  if (session.kind === "hosted") {
    res.cookies.set(SESSION_COOKIE, await createHostedSessionToken({ ...session, driveConnected: false }), sessionCookieOptions);
  }
  return res;
}

export async function GET(request: NextRequest) {
  // The proxy already checks this; verify again right next to the data.
  const session = await verifySessionToken(request.cookies.get(SESSION_COOKIE)?.value);
  if (!session) return Response.json({ ok: false, error: "Not signed in" }, { status: 401, headers });

  const found = await storeFor(session);
  if (!found.ok) return connectDrive(session, found.error);

  const result = await found.store.load();
  if (!result.ok) {
    if (needsReconnect(result.code)) {
      await markDriveLost(session);
      return connectDrive(session, result.error);
    }
    return Response.json({ ok: false, error: result.error }, { status: result.status, headers });
  }

  const config = clientConfig();
  const user = sessionLabel(session);
  const extra = {
    ...(found.sheetOwner ? { sheetOwner: found.sheetOwner } : {}),
    ...(found.sheetUrl ? { sheetUrl: found.sheetUrl } : {}),
  };
  // The dashboard polls with the version it already has; skip the payload when nothing changed.
  if (request.headers.get("x-data-version") === result.version) {
    return Response.json({ ok: true, unchanged: true, version: result.version, demo: result.demo, config, user, ...extra }, { headers });
  }
  return Response.json({ ...result, config, user, ...extra }, { headers });
}
