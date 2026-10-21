import type { NextRequest } from "next/server";
import { clientConfig } from "@/lib/server/config";
import { SESSION_COOKIE, verifySessionToken } from "@/lib/server/session";
import { loadSheet } from "@/lib/server/sheet";

const headers = { "Cache-Control": "private, no-store" };

export async function GET(request: NextRequest) {
  // The proxy already checks this; verify again right next to the data.
  const session = await verifySessionToken(request.cookies.get(SESSION_COOKIE)?.value);
  if (!session) return Response.json({ ok: false, error: "Not signed in" }, { status: 401, headers });

  const result = await loadSheet();
  if (!result.ok) return Response.json({ ok: false, error: result.error }, { status: result.status, headers });

  const config = clientConfig();
  // The dashboard polls with the version it already has; skip the payload when nothing changed.
  if (request.headers.get("x-data-version") === result.version) {
    return Response.json({ ok: true, unchanged: true, version: result.version, demo: result.demo, config, user: session.username }, { headers });
  }
  return Response.json({ ...result, config, user: session.username }, { headers });
}
