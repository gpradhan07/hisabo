import type { NextRequest } from "next/server";
import { hostedConfig } from "@/lib/server/config";
import { adminAuth } from "@/lib/server/firebase";
import { allow } from "@/lib/server/rate-limit";
import { SESSION_COOKIE, verifySessionToken } from "@/lib/server/session";

const headers = { "Cache-Control": "private, no-store" };

/**
 * A short-lived Firebase sign-in for the signed-in user, so their dashboard can listen to `signals/{uid}` and only
 * that (lib/server/live.ts, firestore.rules). POST so it's never prefetched or cached.
 */
export async function POST(request: NextRequest) {
  const config = hostedConfig();
  const session = await verifySessionToken(request.cookies.get(SESSION_COOKIE)?.value);
  if (!config || session?.kind !== "hosted") return Response.json({ ok: false, error: "Not signed in" }, { status: 401, headers });
  if (!allow(`live-token:${session.uid}`, 30, 10 * 60_000)) return Response.json({ ok: false, error: "Too many requests" }, { status: 429, headers });
  return Response.json({ ok: true, uid: session.uid, token: await adminAuth().createCustomToken(session.uid) }, { headers });
}
