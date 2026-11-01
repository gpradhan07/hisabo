"use client";

import { MailCheck } from "lucide-react";
import { useActionState, useEffect, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { AuthHeading } from "../login/auth-frame";
import { Alert, SubmitButton } from "../login/auth-ui";
import { checkConfirmed, resendConfirmation, signUpWithAnotherEmail, type VerifyState } from "./actions";

export function VerifyEmailCard({ email }: { email: string }) {
  const [checked, check, checking] = useActionState<VerifyState>(() => checkConfirmed(), undefined);
  const [resent, resend, resending] = useActionState<VerifyState>(resendConfirmation, undefined);
  const [, startQuietCheck] = useTransition();

  // Confirming happens in another tab or the mail app: check again whenever this page is back in view.
  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState === "visible") startQuietCheck(() => checkConfirmed(true).then(() => undefined));
    };
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("focus", onVisible);
    return () => {
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("focus", onVisible);
    };
  }, []);

  const message = resent ?? checked;
  return (
    <>
      <MailCheck className="mb-5 size-9 text-brand" aria-hidden />
      <AuthHeading title="Check your inbox">
        We sent a confirmation link to <span className="font-medium text-ink">{email}</span>. Click it, then come back here.
      </AuthHeading>

      <div className="mt-8 space-y-3">
        {message?.error && <Alert>{message.error}</Alert>}
        {message?.notice && <Alert tone="ok">{message.notice}</Alert>}
        <form action={check}>
          <SubmitButton pending={checking} label="I've confirmed my email" pendingLabel="Checking…" />
        </form>
        <form action={resend}>
          <Button type="submit" variant="outline" disabled={resending} className="h-11 w-full text-[14px]">
            {resending ? "Sending…" : "Send the email again"}
          </Button>
        </form>
      </div>

      <p className="mt-6 text-[13px] text-pretty text-ink-3">
        Not there after a minute? Check your spam folder. Wrong address?{" "}
        <button type="button" onClick={() => signUpWithAnotherEmail()} className="font-medium text-brand underline-offset-4 hover:underline">
          Use a different email
        </button>
      </p>
    </>
  );
}
