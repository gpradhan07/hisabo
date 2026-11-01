import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createHostedSessionToken, createSessionToken } from "@/lib/server/session";
import { proxy } from "./proxy";

const HOSTED_ENV = {
  NEXT_PUBLIC_FIREBASE_PROJECT_ID: "p",
  NEXT_PUBLIC_FIREBASE_API_KEY: "k",
  FIREBASE_CLIENT_EMAIL: "sa@p.iam.gserviceaccount.com",
  FIREBASE_PRIVATE_KEY: "key",
  GOOGLE_CLIENT_ID: "id",
  GOOGLE_CLIENT_SECRET: "secret",
  TOKEN_ENCRYPTION_KEY: "x".repeat(44),
};

beforeEach(() => {
  vi.stubEnv("SESSION_SECRET", "s".repeat(40));
  vi.stubEnv("DASHBOARD_USERNAME", "owner");
  vi.stubEnv("DASHBOARD_PASSWORD", "password-1");
});
afterEach(() => vi.unstubAllEnvs());

const hosted = () => Object.entries(HOSTED_ENV).forEach(([k, v]) => vi.stubEnv(k, v));

async function visit(path: string, cookie?: string) {
  const req = new NextRequest(new URL(path, "http://localhost:3000"), { headers: cookie ? { cookie: `hisabo_session=${cookie}` } : {} });
  const res = await proxy(req);
  const location = res.headers.get("location");
  if (location) return `→ ${new URL(location).pathname}${new URL(location).search}`;
  return res.status === 200 ? "ok" : `${res.status}`;
}

const user = (emailVerified: boolean, driveConnected: boolean) =>
  createHostedSessionToken({ uid: "u1", email: "asha@gmail.com", emailVerified, driveConnected });

describe("hosted mode", () => {
  beforeEach(hosted);

  it("sends visitors to sign in, and lets the sign-in routes through", async () => {
    expect(await visit("/")).toBe("→ /login");
    expect(await visit("/transactions")).toBe("→ /login?next=%2Ftransactions");
    expect(await visit("/login")).toBe("ok");
    expect(await visit("/api/auth/google")).toBe("ok");
    expect(await visit("/api/ingest")).toBe("ok"); // phone key, checked by the route
    expect(await visit("/privacy")).toBe("ok");
    expect(await visit("/get-shortcut")).toBe("ok");
    expect(await visit("/get-app")).toBe("ok");
    expect(await visit("/api/data")).toBe("401");
  });

  it("keeps an unconfirmed email user on Check your inbox", async () => {
    const t = await user(false, false);
    expect(await visit("/", t)).toBe("→ /verify-email");
    expect(await visit("/connect-drive", t)).toBe("→ /verify-email");
    expect(await visit("/login", t)).toBe("→ /verify-email");
    expect(await visit("/verify-email", t)).toBe("ok");
    expect(await visit("/api/data", t)).toBe("409");
  });

  it("keeps a confirmed user without Drive on Connect Google Drive", async () => {
    const t = await user(true, false);
    expect(await visit("/", t)).toBe("→ /connect-drive");
    expect(await visit("/verify-email", t)).toBe("→ /connect-drive");
    expect(await visit("/connect-drive", t)).toBe("ok");
    expect(await visit("/api/data", t)).toBe("409");
  });

  it("lets a set-up user into the dashboard", async () => {
    const t = await user(true, true);
    expect(await visit("/", t)).toBe("ok");
    expect(await visit("/api/data", t)).toBe("ok");
    expect(await visit("/login", t)).toBe("→ /");
    expect(await visit("/verify-email", t)).toBe("→ /");
    expect(await visit("/connect-drive", t)).toBe("ok");
  });

  it("treats a self-host cookie as signed out", async () => {
    expect(await visit("/", await createSessionToken("owner"))).toBe("→ /login");
  });
});

describe("self-host mode", () => {
  it("works as before", async () => {
    const t = await createSessionToken("owner");
    expect(await visit("/")).toBe("→ /login");
    expect(await visit("/", t)).toBe("ok");
    expect(await visit("/login", t)).toBe("→ /");
    expect(await visit("/connect-drive", t)).toBe("→ /");
  });

  it("treats a hosted cookie as signed out", async () => {
    expect(await visit("/", await user(true, true))).toBe("→ /login");
  });

  it("signs everyone out when the password changes", async () => {
    const t = await createSessionToken("owner");
    vi.stubEnv("DASHBOARD_PASSWORD", "password-2");
    expect(await visit("/", t)).toBe("→ /login");
  });
});
