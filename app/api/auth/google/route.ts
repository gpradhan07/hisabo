import { NextResponse, type NextRequest } from "next/server";
import { hostedConfig } from "@/lib/server/config";
import { authorizationUrl, newAttempt } from "@/lib/server/google-oauth";
import type { Attempt } from "@/lib/server/google-signin";
import { OAUTH_COOKIE } from "@/lib/server/hosted";
import { SESSION_COOKIE, signShortLived, verifySessionToken } from "@/lib/server/session";
import { isValidTimeZone } from "@/lib/server/store/sheet-time";

/**
 * Starts Continue with Google (`?intent=signin`) or Connect Google Drive (`?intent=connect`):
 * remembers the attempt in a short-lived cookie and sends the browser to Google.
 */
export async function GET(request: NextRequest) {
  const config = hostedConfig();
  if (!config) return new NextResponse("Not found", { status: 404 });

  // Google only returns to the registered address, so start there too (the cookie has to live on that origin).
  // Compare the Host the browser used: behind Netlify, nextUrl's origin isn't the public one, and comparing it looped.
  // `moved` makes sure this redirects at most once.
  const app = new URL(config.appUrl);
  const host = (request.headers.get("x-forwarded-host") ?? request.headers.get("host") ?? "").split(",")[0].trim();
  if (host !== app.host && !request.nextUrl.searchParams.has("moved")) {
    const to = new URL(request.nextUrl.pathname + request.nextUrl.search, app);
    to.searchParams.set("moved", "1");
    return NextResponse.redirect(to);
  }

  const params = request.nextUrl.searchParams;
  const intent = params.get("intent") === "connect" ? "connect" : "signin";
  const tz = params.get("tz") ?? "";
  const consent = params.get("consent") === "1";

  let uid: string | undefined;
  let loginHint = params.get("hint") ?? undefined;
  if (intent === "connect") {
    const session = await verifySessionToken(request.cookies.get(SESSION_COOKIE)?.value);
    if (session?.kind !== "hosted" || !session.emailVerified) return NextResponse.redirect(new URL("/login", app));
    uid = session.uid;
    loginHint = session.email;
  }

  const { state, verifier, challenge } = newAttempt();
  const attempt: Attempt = { state, verifier, intent, tz: isValidTimeZone(tz) ? tz : "UTC", uid, consent };

  const res = NextResponse.redirect(
    authorizationUrl({
      clientId: config.googleClientId,
      appUrl: config.appUrl,
      state,
      challenge,
      // Connecting Drive always shows consent, so Google issues a refresh token.
      prompt: consent || intent === "connect" ? "consent" : "select_account",
      loginHint,
    }),
  );
  res.cookies.set(OAUTH_COOKIE, await signShortLived("oauth", { ...attempt }, 600), {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/api/auth/google",
    maxAge: 600,
  });
  return res;
}
