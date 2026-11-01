import { beforeEach, describe, expect, it } from "vitest";
import { FakeAuth } from "@/test/fake-auth";
import { linkGoogleToUser, matchGoogleSignIn } from "./accounts";

const google = (over: Partial<{ sub: string; email: string; emailVerified: boolean }> = {}) => ({
  sub: "g-1",
  email: "asha@gmail.com",
  emailVerified: true,
  name: "Asha",
  ...over,
});

let auth: FakeAuth;
beforeEach(() => {
  auth = new FakeAuth();
});

describe("Continue with Google", () => {
  it("opens the user already linked to this Google account", async () => {
    const u = auth.add({ email: "asha@work.com", emailVerified: true, hasPassword: true, googleSub: "g-1" });
    expect(await matchGoogleSignIn(auth, google())).toEqual({ ok: true, uid: u.uid, email: "asha@work.com" });
  });

  it("links Google to an email account with the same confirmed address", async () => {
    const u = auth.add({ email: "asha@gmail.com", emailVerified: true, hasPassword: true });
    expect(await matchGoogleSignIn(auth, google())).toMatchObject({ ok: true, uid: u.uid });
    expect(auth.users.get(u.uid)).toMatchObject({ googleSub: "g-1", hasPassword: true });
  });

  it("takes over an unconfirmed email account: Google proved the address", async () => {
    const u = auth.add({ email: "asha@gmail.com", emailVerified: false, hasPassword: true });
    expect(await matchGoogleSignIn(auth, google())).toMatchObject({ ok: true, uid: u.uid });
    expect(auth.users.get(u.uid)).toMatchObject({ googleSub: "g-1", hasPassword: false, emailVerified: true });
  });

  it("refuses an existing account when Google hasn't confirmed the email", async () => {
    auth.add({ email: "asha@gmail.com", emailVerified: true, hasPassword: true });
    expect(await matchGoogleSignIn(auth, google({ emailVerified: false }))).toEqual({ ok: false, reason: "google-email-unverified" });
  });

  it("keeps an existing Drive link to another Google account", async () => {
    const u = auth.add({ email: "asha@gmail.com", emailVerified: true, hasPassword: true, googleSub: "g-other" });
    expect(await matchGoogleSignIn(auth, google())).toMatchObject({ ok: true, uid: u.uid });
    expect(auth.users.get(u.uid)?.googleSub).toBe("g-other");
  });

  it("creates a new user otherwise", async () => {
    const res = await matchGoogleSignIn(auth, google());
    expect(res).toMatchObject({ ok: true, email: "asha@gmail.com" });
    expect(auth.users.size).toBe(1);
    expect([...auth.users.values()][0]).toMatchObject({ googleSub: "g-1", emailVerified: true });
  });
});

describe("Connect Google Drive", () => {
  it("links a Google account with a different email", async () => {
    const u = auth.add({ email: "asha@outlook.com", emailVerified: true, hasPassword: true });
    expect(await linkGoogleToUser(auth, u.uid, google())).toEqual({ ok: true });
    expect(auth.users.get(u.uid)?.googleSub).toBe("g-1");
  });

  it("is fine reconnecting the same Google account", async () => {
    const u = auth.add({ email: "asha@gmail.com", emailVerified: true, hasPassword: false, googleSub: "g-1" });
    expect(await linkGoogleToUser(auth, u.uid, google())).toEqual({ ok: true });
  });

  it("switches to another Google account", async () => {
    const u = auth.add({ email: "asha@gmail.com", emailVerified: true, hasPassword: true, googleSub: "g-old" });
    expect(await linkGoogleToUser(auth, u.uid, google())).toEqual({ ok: true });
    expect(auth.users.get(u.uid)?.googleSub).toBe("g-1");
  });

  it("refuses a Google account that belongs to another hisabo user", async () => {
    auth.add({ email: "ravi@gmail.com", emailVerified: true, hasPassword: false, googleSub: "g-1" });
    const u = auth.add({ email: "asha@outlook.com", emailVerified: true, hasPassword: true });
    expect(await linkGoogleToUser(auth, u.uid, google())).toEqual({ ok: false, reason: "google-in-use" });
  });
});
