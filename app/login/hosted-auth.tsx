"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useActionState, useEffect } from "react";
import { forgetCachedData } from "@/lib/local-data";
import { emailSignIn, emailSignUp, requestPasswordReset } from "./actions";
import { AuthHeading } from "./auth-frame";
import { Alert, EmailField, GoogleButton, OrDivider, PasswordField, SubmitButton } from "./auth-ui";

type Mode = "signin" | "signup" | "reset";

/** Why Google sign-in sent the user back here (`/login?error=…`). */
const GOOGLE_ERRORS: Record<string, string> = {
  expired: "That sign-in expired or was opened in another tab. Try again.",
  cancelled: "Google sign-in was cancelled.",
  failed: "Google sign-in didn't work. Try again in a moment.",
  "google-email-unverified": "Google hasn't confirmed this account's email, so it can't open your hisabo account. Sign in with your email and password.",
  "no-email": "Google didn't share an email address for this account.",
};

/** After "Delete my account" (`/login?deleted=…`). */
const DELETED: Record<string, string> = {
  done: "Your hisabo account is deleted. Sign up again any time to start fresh.",
  "sheet-kept": "Your hisabo account is deleted. hisabo couldn't reach your sheet, so delete \"hisabo\" from your Google Drive yourself.",
};

const linkClass = "font-medium text-brand underline-offset-4 hover:underline";

/** Hosted mode: Continue with Google, or email and password (sign in, sign up, reset). */
export function HostedAuth() {
  const params = useSearchParams();
  const raw = params.get("mode");
  const mode: Mode = raw === "signup" || raw === "reset" ? raw : "signin";
  const googleError = GOOGLE_ERRORS[params.get("error") ?? ""];
  const deleted = DELETED[params.get("deleted") ?? ""];
  const next = params.get("next") ?? "/";

  // Whoever signs in next shouldn't see the last person's cached dashboard.
  useEffect(() => forgetCachedData(), []);

  if (mode === "reset") return <ResetForm />;

  const signup = mode === "signup";
  return (
    <>
      <AuthHeading title={signup ? "Create your account" : "Welcome back"}>
        {signup ? "Your expenses go into a spreadsheet in your own Google Drive." : "Sign in to see your dashboard."}
      </AuthHeading>

      <div className="mt-8 space-y-5">
        {googleError && <Alert>{googleError}</Alert>}
        {deleted && <Alert tone="ok">{deleted}</Alert>}
        <GoogleButton intent="signin" label="Continue with Google" />
        <OrDivider />
        {signup ? <SignUpForm /> : <SignInForm next={next} />}
      </div>

      <p className="mt-6 text-center text-[14px] text-ink-2">
        {signup ? "Already have an account? " : "New to hisabo? "}
        <Link href={signup ? "/login" : "/login?mode=signup"} replace className={linkClass}>
          {signup ? "Sign in" : "Create an account"}
        </Link>
      </p>
    </>
  );
}

function SignInForm({ next }: { next: string }) {
  const [state, action, pending] = useActionState(emailSignIn, undefined);
  return (
    <form action={action} className="space-y-5">
      <input type="hidden" name="next" value={next} />
      <EmailField defaultValue={state?.email} />
      <PasswordField
        aside={
          <Link href="/login?mode=reset" replace className="text-[13px] text-ink-2 underline-offset-4 hover:text-ink hover:underline">
            Forgot password?
          </Link>
        }
      />
      {state?.error && <Alert>{state.error}</Alert>}
      <SubmitButton pending={pending} label="Sign in" pendingLabel="Signing in…" />
    </form>
  );
}

function SignUpForm() {
  const [state, action, pending] = useActionState(emailSignUp, undefined);
  return (
    <form action={action} className="space-y-5">
      <EmailField defaultValue={state?.email} />
      <PasswordField newPassword />
      {state?.error && <Alert>{state.error}</Alert>}
      <SubmitButton pending={pending} label="Create account" pendingLabel="Creating your account…" />
      <p className="text-[12px] text-pretty text-ink-3">Next, you&apos;ll confirm your email and connect Google Drive.</p>
    </form>
  );
}

function ResetForm() {
  const [state, action, pending] = useActionState(requestPasswordReset, undefined);
  return (
    <>
      <AuthHeading title="Reset your password">We&apos;ll email you a link to choose a new one.</AuthHeading>
      <form action={action} className="mt-8 space-y-5">
        <EmailField defaultValue={state?.email} />
        {state?.error && <Alert>{state.error}</Alert>}
        {state?.notice && <Alert tone="ok">{state.notice}</Alert>}
        <SubmitButton pending={pending} label="Send reset link" pendingLabel="Sending…" />
      </form>
      <p className="mt-6 text-center text-[14px] text-ink-2">
        <Link href="/login" replace className={linkClass}>
          Back to sign in
        </Link>
      </p>
    </>
  );
}
