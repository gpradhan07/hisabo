import { randomBytes } from "node:crypto";
import { beforeEach, describe, expect, it } from "vitest";
import { FakeAuth, MemoryUsers } from "@/test/fake-auth";
import { FakeSheets } from "@/test/fake-sheets";
import type { HostedConfig } from "./config";
import { decrypt, encrypt } from "./crypto";
import { DRIVE_FILE_SCOPE } from "./google-oauth";
import { completeGoogleSignIn, type Attempt, type SignInDeps } from "./google-signin";

const config: HostedConfig = {
  projectId: "p",
  apiKey: "k",
  clientEmail: "sa@p.iam.gserviceaccount.com",
  privateKey: "unused",
  googleClientId: "client-id",
  googleClientSecret: "client-secret",
  tokenKey: randomBytes(32).toString("base64"),
  appUrl: "http://localhost:3000",
};

const ALL_SCOPES = `openid https://www.googleapis.com/auth/userinfo.email ${DRIVE_FILE_SCOPE}`;

let auth: FakeAuth, users: MemoryUsers, sheets: FakeSheets;
/** What Google's token endpoint answers next, and what it was sent. */
let tokenReply: Record<string, unknown>;
let tokenRequests: URLSearchParams[];
let identity: { sub: string; email: string; emailVerified: boolean };

beforeEach(() => {
  auth = new FakeAuth();
  users = new MemoryUsers();
  sheets = new FakeSheets();
  tokenRequests = [];
  identity = { sub: "g-1", email: "asha@gmail.com", emailVerified: true };
  tokenReply = { access_token: sheets.validToken, expires_in: 3599, refresh_token: "refresh-1", scope: ALL_SCOPES, id_token: "id-token" };
});

function deps(): SignInDeps {
  return {
    config,
    admin: auth,
    users,
    verifyIdToken: async () => identity,
    fetch: async (input, init) => {
      if (String(input) === "https://oauth2.googleapis.com/token") {
        tokenRequests.push(new URLSearchParams(String(init?.body)));
        return Response.json(tokenReply);
      }
      return sheets.fetch(input, init);
    },
  };
}

const attempt = (over: Partial<Attempt> = {}): Attempt => ({ state: "s", verifier: "v", intent: "signin", tz: "Asia/Kolkata", consent: false, ...over });
const signIn = (over: Partial<Attempt> = {}, params: { code?: string; error?: string } = { code: "code-1" }) =>
  completeGoogleSignIn(deps(), attempt(over), params);

describe("Continue with Google", () => {
  it("signs up a new user: account, spreadsheet in their time zone, encrypted tokens", async () => {
    const out = await signIn();
    expect(out).toMatchObject({ kind: "signed-in", session: { email: "asha@gmail.com", emailVerified: true, driveConnected: true } });
    if (out.kind !== "signed-in") return;

    // The code was swapped with PKCE and the registered redirect address.
    expect(Object.fromEntries(tokenRequests[0])).toMatchObject({
      grant_type: "authorization_code",
      code: "code-1",
      code_verifier: "v",
      redirect_uri: "http://localhost:3000/api/auth/google/callback",
    });

    const doc = await users.get(out.session.uid);
    expect(doc).toMatchObject({ googleSub: "g-1", googleEmail: "asha@gmail.com", driveStatus: "connected" });
    expect(doc!.googleRefreshToken).not.toContain("refresh-1");
    expect(decrypt(doc!.googleRefreshToken, config.tokenKey)).toBe("refresh-1");
    expect(sheets.file(doc!.sheetId!)).toMatchObject({ title: "hisabo", timeZone: "Asia/Kolkata" });
  });

  it("signs a returning user back in without a new spreadsheet or refresh token", async () => {
    const first = await signIn();
    if (first.kind !== "signed-in") throw new Error("first sign-in failed");
    const { sheetId } = (await users.get(first.session.uid))!;

    delete tokenReply.refresh_token; // Google only sends it on consent
    const again = await signIn();
    expect(again).toMatchObject({ kind: "signed-in", session: { uid: first.session.uid, driveConnected: true } });
    const doc = (await users.get(first.session.uid))!;
    expect(doc.sheetId).toBe(sheetId);
    expect(decrypt(doc.googleRefreshToken, config.tokenKey)).toBe("refresh-1");
  });

  it("asks for consent again when Google sends no refresh token and none is stored", async () => {
    delete tokenReply.refresh_token;
    expect(await signIn()).toEqual({ kind: "need-consent", loginHint: "asha@gmail.com" });
    // After forcing consent, give up instead of looping.
    expect(await signIn({ consent: true })).toMatchObject({ kind: "failed", reason: "failed", session: { driveConnected: false } });
  });

  it("signs in without Drive when the Drive box was unticked", async () => {
    tokenReply.scope = "openid https://www.googleapis.com/auth/userinfo.email";
    expect(await signIn()).toMatchObject({ kind: "failed", reason: "drive-not-granted", session: { driveConnected: false } });
  });

  it("makes a new spreadsheet when the old one was deleted", async () => {
    const first = await signIn();
    if (first.kind !== "signed-in") throw new Error("first sign-in failed");
    const old = (await users.get(first.session.uid))!.sheetId!;
    await users.save(first.session.uid, { sheetId: "deleted-sheet" });

    await signIn();
    const now = (await users.get(first.session.uid))!.sheetId!;
    expect(now).not.toBe("deleted-sheet");
    expect(now).not.toBe(old);
  });

  it("doesn't move a working Drive connection when another Google account with the same email signs in", async () => {
    const u = auth.add({ email: "asha@gmail.com", emailVerified: true, hasPassword: true, googleSub: "g-drive" });
    await users.save(u.uid, { googleSub: "g-drive", sheetId: "sheet-x", driveStatus: "connected", googleRefreshToken: encrypt("r", config.tokenKey) });
    expect(await signIn()).toMatchObject({ kind: "signed-in", session: { uid: u.uid, driveConnected: true } });
    expect((await users.get(u.uid))!.googleSub).toBe("g-drive");
  });

  it.each([
    ["access_denied", "cancelled"],
    ["server_error", "failed"],
  ])("reports Google's %s as %s", async (error, reason) => {
    expect(await signIn({}, { error })).toEqual({ kind: "failed", reason });
  });

  it("fails cleanly when the code can't be swapped", async () => {
    tokenReply = { error: "invalid_grant" };
    const failing = deps();
    const fetchImpl = failing.fetch!;
    failing.fetch = async (input, init) =>
      String(input).includes("oauth2") ? Response.json({ error: "invalid_grant" }, { status: 400 }) : fetchImpl(input, init);
    expect(await completeGoogleSignIn(failing, attempt(), { code: "used" })).toEqual({ kind: "failed", reason: "failed" });
  });
});

describe("Connect Google Drive", () => {
  it("connects Drive for a confirmed email user, with any Google account", async () => {
    const u = auth.add({ email: "asha@outlook.com", emailVerified: true, hasPassword: true });
    const out = await signIn({ intent: "connect", uid: u.uid });
    expect(out).toMatchObject({ kind: "signed-in", session: { uid: u.uid, email: "asha@outlook.com", driveConnected: true } });
    expect((await users.get(u.uid))!.googleEmail).toBe("asha@gmail.com");
  });

  it("refuses a Google account that already belongs to someone else", async () => {
    auth.add({ email: "ravi@gmail.com", emailVerified: true, hasPassword: false, googleSub: "g-1" });
    const u = auth.add({ email: "asha@outlook.com", emailVerified: true, hasPassword: true });
    expect(await signIn({ intent: "connect", uid: u.uid })).toEqual({ kind: "failed", reason: "google-in-use" });
    expect(await users.get(u.uid)).toBeNull();
  });
});
