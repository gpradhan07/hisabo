import { randomBytes } from "node:crypto";
import { beforeEach, describe, expect, it } from "vitest";
import { MemoryUsers } from "@/test/fake-auth";
import type { HostedConfig } from "./config";
import { decrypt, encrypt } from "./crypto";
import { ReauthRequiredError } from "./store/google-sheets";
import { accessTokenSource, forgetAccessToken, type UserDoc } from "./users";

const config = { googleClientId: "id", googleClientSecret: "secret", tokenKey: randomBytes(32).toString("base64") } as HostedConfig;

let users: MemoryUsers;
let refreshes: number;
let reply: { status: number; body: Record<string, unknown> };
const fetchImpl: typeof fetch = async () => {
  refreshes++;
  return Response.json(reply.body, { status: reply.status });
};

const doc = (over: Partial<UserDoc> = {}): UserDoc => ({
  googleSub: "g",
  googleEmail: "a@gmail.com",
  driveStatus: "connected",
  sheetId: "s",
  googleRefreshToken: encrypt("refresh", config.tokenKey),
  createdAt: 0,
  updatedAt: 0,
  ...over,
});

beforeEach(() => {
  users = new MemoryUsers();
  refreshes = 0;
  reply = { status: 200, body: { access_token: "fresh", expires_in: 3599 } };
  forgetAccessToken("u1");
});

describe("accessTokenSource", () => {
  it("uses the stored access token while it's valid", async () => {
    const user = doc({ googleAccessToken: encrypt("stored", config.tokenKey), googleAccessExpires: Date.now() + 30 * 60_000 });
    expect(await accessTokenSource({ users, config, fetch: fetchImpl }, "u1", user)()).toBe("stored");
    expect(refreshes).toBe(0);
  });

  it("refreshes an expired token, saves it encrypted, then serves it from memory", async () => {
    const user = doc({ googleAccessToken: encrypt("old", config.tokenKey), googleAccessExpires: Date.now() - 1 });
    const source = accessTokenSource({ users, config, fetch: fetchImpl }, "u1", user);
    expect(await source()).toBe("fresh");
    expect(await source()).toBe("fresh");
    expect(refreshes).toBe(1);
    const saved = (await users.get("u1"))!;
    expect(decrypt(saved.googleAccessToken!, config.tokenKey)).toBe("fresh");
    expect(saved.googleAccessExpires).toBeGreaterThan(Date.now());
  });

  it("refreshes when asked, even with a valid token", async () => {
    const user = doc({ googleAccessToken: encrypt("stored", config.tokenKey), googleAccessExpires: Date.now() + 30 * 60_000 });
    expect(await accessTokenSource({ users, config, fetch: fetchImpl }, "u1", user)({ refresh: true })).toBe("fresh");
  });

  it("marks Drive as needing reconnection when the user removed access", async () => {
    reply = { status: 400, body: { error: "invalid_grant", error_description: "Token has been expired or revoked." } };
    await expect(accessTokenSource({ users, config, fetch: fetchImpl }, "u1", doc())()).rejects.toBeInstanceOf(ReauthRequiredError);
    expect((await users.get("u1"))!.driveStatus).toBe("needs-reconnect");
  });
});

describe("token encryption", () => {
  it("round-trips and rejects tampering or another key", () => {
    const sealed = encrypt("secret-token", config.tokenKey);
    expect(sealed).toMatch(/^v1\./);
    expect(decrypt(sealed, config.tokenKey)).toBe("secret-token");
    expect(encrypt("secret-token", config.tokenKey)).not.toBe(sealed); // random IV
    const flipped = sealed.slice(0, -2) + (sealed.at(-2) === "A" ? "B" : "A") + sealed.at(-1);
    expect(() => decrypt(flipped, config.tokenKey)).toThrow();
    expect(() => decrypt(sealed, randomBytes(32).toString("base64"))).toThrow();
  });
});
