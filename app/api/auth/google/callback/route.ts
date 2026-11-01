import { NextResponse, type NextRequest } from "next/server";
import { hostedConfig } from "@/lib/server/config";
import { completeGoogleSignIn, type Attempt } from "@/lib/server/google-signin";
import { OAUTH_COOKIE, hostedServices } from "@/lib/server/hosted";
import { SESSION_COOKIE, createHostedSessionToken, sessionCookieOptions, verifyShortLived } from "@/lib/server/session";

/** Google sends the browser back here with a one-time code (or an error). */
export async function GET(request: NextRequest) {
  const config = hostedConfig();
  if (!config) return new NextResponse("Not found", { status: 404 });

  const params = request.nextUrl.searchParams;
  const to = (path: string) => new URL(path, config.appUrl);
  const saved = (await verifyShortLived("oauth", request.cookies.get(OAUTH_COOKIE)?.value)) as unknown as Attempt | null;

  // Missing or mismatched state: an old tab, a second attempt, or a forged request.
  if (!saved || !params.get("state") || saved.state !== params.get("state")) {
    const res = NextResponse.redirect(to("/login?error=expired"));
    res.cookies.delete({ name: OAUTH_COOKIE, path: "/api/auth/google" });
    return res;
  }

  const outcome = await completeGoogleSignIn(hostedServices(config), saved, { code: params.get("code"), error: params.get("error") });

  let res: NextResponse;
  if (outcome.kind === "need-consent") {
    const again = new URLSearchParams({ intent: saved.intent, tz: saved.tz, consent: "1", hint: outcome.loginHint });
    res = NextResponse.redirect(to(`/api/auth/google?${again}`));
  } else {
    const session = outcome.session;
    // Signed in but without Drive (or a failed Connect): the Connect Google Drive page explains what happened.
    const home = outcome.kind === "signed-in" ? "/" : saved.intent === "connect" || session ? `/connect-drive?error=${outcome.reason}` : `/login?error=${outcome.reason}`;
    res = NextResponse.redirect(to(home));
    if (session) res.cookies.set(SESSION_COOKIE, await createHostedSessionToken(session), sessionCookieOptions);
  }
  res.cookies.delete({ name: OAUTH_COOKIE, path: "/api/auth/google" });
  return res;
}
