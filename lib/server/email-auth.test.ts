import { describe, expect, it } from "vitest";
import { allow } from "./rate-limit";
import { sendPasswordResetEmail, signInWithEmail, signUpWithEmail } from "./email-auth";

const firebaseError = (message: string): typeof fetch => async () => Response.json({ error: { code: 400, message } }, { status: 400 });

describe("email accounts", () => {
  it("returns the user on success", async () => {
    const ok: typeof fetch = async () => Response.json({ localId: "uid-1", idToken: "tok" });
    expect(await signUpWithEmail("key", "a@b.co", "password1", ok)).toEqual({ ok: true, value: { uid: "uid-1", idToken: "tok" } });
  });

  it.each([
    ["EMAIL_EXISTS", "An account with this email already exists. Sign in instead."],
    ["INVALID_LOGIN_CREDENTIALS", "Email or password is incorrect."],
    ["TOO_MANY_ATTEMPTS_TRY_LATER : Access to this account has been temporarily disabled", "Too many attempts. Wait a few minutes and try again."],
    ["WEAK_PASSWORD : Password should be at least 6 characters", "Choose a longer password."],
    ["SOMETHING_NEW", "Something went wrong. Try again in a moment."],
  ])("explains %s", async (code, error) => {
    expect(await signInWithEmail("key", "a@b.co", "x", firebaseError(code))).toMatchObject({ ok: false, error });
  });

  it("explains a network failure", async () => {
    const down: typeof fetch = async () => {
      throw new TypeError("fetch failed");
    };
    expect(await sendPasswordResetEmail("key", "a@b.co", "http://x", down)).toMatchObject({ ok: false, code: "NETWORK" });
  });
});

describe("rate limit", () => {
  it("allows up to the limit in the window, then again once it has passed", () => {
    const key = `test-${Math.random()}`;
    expect([1, 2, 3].map(() => allow(key, 3, 1000, 0))).toEqual([true, true, true]);
    expect(allow(key, 3, 1000, 500)).toBe(false);
    expect(allow(key, 3, 1000, 1001)).toBe(true);
  });
});
