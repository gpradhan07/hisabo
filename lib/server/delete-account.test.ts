import { randomBytes } from "node:crypto";
import { beforeEach, describe, expect, it } from "vitest";
import { FakeAuth, MemoryKeys, MemoryUsers } from "@/test/fake-auth";
import type { HostedConfig } from "./config";
import { encrypt } from "./crypto";
import { deleteAccount } from "./delete-account";
import { forgetAccessToken, type UserDoc } from "./users";

const config = { googleClientId: "id", googleClientSecret: "secret", tokenKey: randomBytes(32).toString("base64") } as HostedConfig;

let users: MemoryUsers;
let keys: MemoryKeys;
let admin: FakeAuth;
let calls: string[];
/** What Google answers: Drive's trash request, and the token endpoints */
let drive: number;
let refresh: { status: number; body: Record<string, unknown> };

const fetchImpl: typeof fetch = async (input, init) => {
  const url = String(input);
  const body = init?.body instanceof URLSearchParams ? init.body : new URLSearchParams();
  if (url.startsWith("https://www.googleapis.com/drive/v3/files/")) {
    calls.push(`${init?.method} drive ${url.split("/").pop()} ${init?.body} as ${(init?.headers as Record<string, string>).Authorization}`);
    return new Response("{}", { status: drive });
  }
  if (url === "https://oauth2.googleapis.com/revoke") {
    calls.push(`revoke ${body.get("token")}`);
    return new Response("{}", { status: 200 });
  }
  if (url === "https://oauth2.googleapis.com/token") {
    calls.push("refresh");
    return Response.json(refresh.body, { status: refresh.status });
  }
  throw new Error(`unexpected ${url}`);
};

const doc = (over: Partial<UserDoc> = {}): UserDoc => ({
  googleSub: "g",
  googleEmail: "a@gmail.com",
  driveStatus: "connected",
  sheetId: "sheet-1",
  googleRefreshToken: encrypt("refresh-1", config.tokenKey),
  googleAccessToken: encrypt("access-1", config.tokenKey),
  googleAccessExpires: Date.now() + 30 * 60_000,
  createdAt: 0,
  updatedAt: 0,
  ...over,
});

const run = (uid = "u1") => deleteAccount({ config, users, phoneKeys: keys, admin, fetch: fetchImpl }, uid);

beforeEach(async () => {
  users = new MemoryUsers();
  keys = new MemoryKeys();
  admin = new FakeAuth();
  calls = [];
  drive = 200;
  refresh = { status: 200, body: { access_token: "access-2", expires_in: 3599 } };
  forgetAccessToken("u1");
  admin.add({ uid: "u1", email: "a@gmail.com", emailVerified: true, hasPassword: false, googleSub: "g" });
  admin.add({ uid: "u2", email: "b@gmail.com", emailVerified: true, hasPassword: false });
  users.docs.set("u1", doc());
  await keys.create("k1", { uid: "u1", label: "iPhone", createdAt: 0 });
  await keys.create("k2", { uid: "u1", label: "iPad", createdAt: 0 });
  await keys.create("k3", { uid: "u2", label: "Other person", createdAt: 0 });
});

describe("deleteAccount", () => {
  it("removes the account's live-update signal too", async () => {
    const removed: string[] = [];
    const signals = { notify: async () => {}, remove: async (uid: string) => void removed.push(uid) };
    await deleteAccount({ config, users, phoneKeys: keys, admin, signals, fetch: fetchImpl }, "u1");
    expect(removed).toEqual(["u1"]);
  });

  it("trashes the sheet, revokes Google access, then deletes the keys, record and login", async () => {
    expect(await run()).toEqual({ sheetRemoved: true });
    expect(calls).toEqual(['PATCH drive sheet-1 {"trashed":true} as Bearer access-1', "revoke refresh-1"]);
    expect([...keys.docs.keys()]).toEqual(["k3"]); // someone else's key stays
    expect(users.docs.has("u1")).toBe(false);
    expect(admin.users.has("u1")).toBe(false);
    expect(admin.users.has("u2")).toBe(true);
  });

  it("gets a fresh token when the stored one was rejected", async () => {
    let first = true;
    const inner = fetchImpl;
    const flaky: typeof fetch = async (input, init) => {
      if (String(input).includes("/drive/") && first) {
        first = false;
        calls.push("drive 401");
        return new Response("{}", { status: 401 });
      }
      return inner(input, init);
    };
    expect(await deleteAccount({ config, users, phoneKeys: keys, admin, fetch: flaky }, "u1")).toEqual({ sheetRemoved: true });
    expect(calls.slice(0, 3)).toEqual(["drive 401", "refresh", 'PATCH drive sheet-1 {"trashed":true} as Bearer access-2']);
  });

  it("counts a sheet that's already gone as removed", async () => {
    drive = 404;
    expect(await run()).toEqual({ sheetRemoved: true });
  });

  it("still deletes everything when Google access was already removed, and says the sheet stayed", async () => {
    users.docs.set("u1", doc({ googleAccessToken: undefined, googleAccessExpires: undefined }));
    refresh = { status: 400, body: { error: "invalid_grant" } };
    expect(await run()).toEqual({ sheetRemoved: false });
    expect(users.docs.has("u1")).toBe(false);
    expect(admin.users.has("u1")).toBe(false);
    expect([...keys.docs.keys()]).toEqual(["k3"]);
  });

  it("deletes an email account that never connected Drive", async () => {
    users.docs.delete("u1");
    expect(await run()).toEqual({ sheetRemoved: true });
    expect(calls).toEqual([]);
    expect(admin.users.has("u1")).toBe(false);
  });
});
