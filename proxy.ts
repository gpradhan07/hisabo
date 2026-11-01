import { NextResponse, type NextRequest } from "next/server";
import { SESSION_COOKIE, verifySessionToken, type HostedSession } from "@/lib/server/session";

/**
 * Every page and API route needs a signed-in session, except the sign-in pages. In hosted mode a user also
 * passes through "Check your inbox" (email sign-up) and "Connect Google Drive" before the dashboard.
 * Server actions and route handlers check the session again themselves.
 */
export async function proxy(request: NextRequest) {
  const { pathname, search } = request.nextUrl;
  const session = await verifySessionToken(request.cookies.get(SESSION_COOKIE)?.value);
  const to = (path: string) => NextResponse.redirect(new URL(path, request.url));

  // Google sign-in checks the session itself; the Shortcut's /api/ingest uses a phone key instead.
  if (pathname.startsWith("/api/auth/") || pathname === "/api/ingest") return NextResponse.next();
  // Public: Google's consent screen links to /privacy; the Add to iPhone QR codes open /get-shortcut and /get-app on a phone
  if (pathname === "/privacy" || pathname === "/get-shortcut" || pathname === "/get-app") return NextResponse.next();

  if (!session) {
    if (pathname === "/login") return NextResponse.next();
    if (pathname.startsWith("/api/")) return NextResponse.json({ ok: false, error: "Not signed in" }, { status: 401 });
    const login = new URL("/login", request.url);
    if (pathname !== "/" && pathname !== "/verify-email" && pathname !== "/connect-drive") login.searchParams.set("next", pathname + search);
    return NextResponse.redirect(login);
  }

  if (session.kind === "selfhost") {
    if (pathname === "/login" || pathname === "/verify-email" || pathname === "/connect-drive") return to("/");
    return NextResponse.next();
  }

  const step = nextStep(session);
  if (pathname === "/login") return to(step ?? "/");
  if (step) {
    if (pathname === step) return NextResponse.next();
    if (pathname.startsWith("/api/")) return NextResponse.json({ ok: false, code: "connect-drive", error: "Finish setting up your account." }, { status: 409 });
    return to(step);
  }
  // Fully set up. Connect Google Drive stays reachable, to switch the Google account.
  if (pathname === "/verify-email") return to("/");
  return NextResponse.next();
}

/** Where an unfinished hosted account has to go next, or null when it's ready. */
function nextStep(s: HostedSession): string | null {
  if (!s.emailVerified) return "/verify-email";
  if (!s.driveConnected) return "/connect-drive";
  return null;
}

export const config = {
  // Everything except Next's assets and public files (icons, logo, manifest, the Shortcut)
  matcher: ["/((?!_next/static|_next/image|manifest.webmanifest|.*\\.(?:png|ico|svg|webp|shortcut)$).*)"],
};
