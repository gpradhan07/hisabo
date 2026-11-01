import "server-only";

/**
 * Email + password accounts through Firebase Authentication's REST API. Firebase stores and checks the
 * passwords, sends the confirmation and reset emails, and slows down repeated wrong guesses.
 */

export type EmailAuthResult<T> = { ok: true; value: T } | { ok: false; code: string; error: string };

const MESSAGES: Record<string, string> = {
  EMAIL_EXISTS: "An account with this email already exists. Sign in instead.",
  INVALID_EMAIL: "That email doesn't look right.",
  INVALID_LOGIN_CREDENTIALS: "Email or password is incorrect.",
  EMAIL_NOT_FOUND: "Email or password is incorrect.",
  INVALID_PASSWORD: "Email or password is incorrect.",
  USER_DISABLED: "This account has been turned off.",
  TOO_MANY_ATTEMPTS_TRY_LATER: "Too many attempts. Wait a few minutes and try again.",
  OPERATION_NOT_ALLOWED: "Email sign-in isn't turned on for this hisabo. Use Continue with Google.",
  WEAK_PASSWORD: "Choose a longer password.",
};

async function call<T>(apiKey: string, method: string, body: Record<string, unknown>, fetchImpl: typeof fetch): Promise<EmailAuthResult<T>> {
  let res: Response;
  try {
    res = await fetchImpl(`https://identitytoolkit.googleapis.com/v1/accounts:${method}?key=${encodeURIComponent(apiKey)}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      cache: "no-store",
      signal: AbortSignal.timeout(15_000),
    });
  } catch {
    return { ok: false, code: "NETWORK", error: "Couldn't reach the sign-in service. Try again in a moment." };
  }
  const json = (await res.json().catch(() => ({}))) as { error?: { message?: string } } & T;
  if (!res.ok) {
    // Firebase sends codes like "WEAK_PASSWORD : Password should be at least 6 characters".
    const code = (json.error?.message ?? "UNKNOWN").split(/[ :]/)[0];
    return { ok: false, code, error: MESSAGES[code] ?? "Something went wrong. Try again in a moment." };
  }
  return { ok: true, value: json };
}

export interface EmailUser {
  uid: string;
  idToken: string;
}

const toUser = (r: EmailAuthResult<{ localId: string; idToken: string }>): EmailAuthResult<EmailUser> =>
  r.ok ? { ok: true, value: { uid: r.value.localId, idToken: r.value.idToken } } : r;

export async function signUpWithEmail(apiKey: string, email: string, password: string, fetchImpl: typeof fetch = fetch) {
  return toUser(await call(apiKey, "signUp", { email, password, returnSecureToken: true }, fetchImpl));
}

export async function signInWithEmail(apiKey: string, email: string, password: string, fetchImpl: typeof fetch = fetch) {
  return toUser(await call(apiKey, "signInWithPassword", { email, password, returnSecureToken: true }, fetchImpl));
}

/** Swaps a server-made custom token for an ID token, which Firebase needs before it sends a confirmation email. */
export async function idTokenFromCustomToken(apiKey: string, customToken: string, fetchImpl: typeof fetch = fetch) {
  return toUser(await call(apiKey, "signInWithCustomToken", { token: customToken, returnSecureToken: true }, fetchImpl));
}

/** Firebase emails a confirmation link; after confirming, its page offers a button back to `continueUrl`. */
export async function sendConfirmationEmail(apiKey: string, idToken: string, continueUrl: string, fetchImpl: typeof fetch = fetch) {
  return call(apiKey, "sendOobCode", { requestType: "VERIFY_EMAIL", idToken, continueUrl }, fetchImpl);
}

export async function sendPasswordResetEmail(apiKey: string, email: string, continueUrl: string, fetchImpl: typeof fetch = fetch) {
  return call(apiKey, "sendOobCode", { requestType: "PASSWORD_RESET", email, continueUrl }, fetchImpl);
}
