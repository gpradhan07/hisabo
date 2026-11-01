"use client";

import { CircleAlert, CircleCheck, Eye, EyeOff, LoaderCircle, LockKeyhole, Mail } from "lucide-react";
import { useEffect, useState, useSyncExternalStore } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

/** Small pieces shared by the hosted sign-in, "Check your inbox" and "Connect Google Drive" screens. */

const inputClass = "h-12 pl-10 text-[16px] sm:text-[15px]";

export function Alert({ tone = "error", children }: { tone?: "error" | "ok"; children: React.ReactNode }) {
  const Icon = tone === "error" ? CircleAlert : CircleCheck;
  return (
    <p
      role={tone === "error" ? "alert" : "status"}
      className={cn(
        "flex items-start gap-2 rounded-lg border px-3 py-2.5 text-[13px] text-pretty",
        tone === "error" ? "border-bad/30 bg-bad-soft text-bad" : "border-brand/30 bg-brand-soft text-brand-ink",
      )}
    >
      <Icon className="mt-0.5 size-4 shrink-0" aria-hidden />
      <span>{children}</span>
    </p>
  );
}

export function EmailField({ defaultValue }: { defaultValue?: string }) {
  return (
    <div className="space-y-2">
      <Label htmlFor="email">Email</Label>
      <div className="relative">
        <Mail className="pointer-events-none absolute top-1/2 left-3.5 size-4.5 -translate-y-1/2 text-muted-foreground" aria-hidden />
        <Input
          id="email"
          name="email"
          type="email"
          required
          autoComplete="email"
          autoCapitalize="none"
          spellCheck={false}
          defaultValue={defaultValue}
          className={inputClass}
        />
      </div>
    </div>
  );
}

export function PasswordField({ label = "Password", newPassword = false, aside }: { label?: string; newPassword?: boolean; aside?: React.ReactNode }) {
  const [show, setShow] = useState(false);
  return (
    <div className="space-y-2">
      <div className="flex items-baseline justify-between gap-3">
        <Label htmlFor="password">{label}</Label>
        {aside}
      </div>
      <div className="relative">
        <LockKeyhole className="pointer-events-none absolute top-1/2 left-3.5 size-4.5 -translate-y-1/2 text-muted-foreground" aria-hidden />
        <Input
          id="password"
          name="password"
          type={show ? "text" : "password"}
          required
          minLength={newPassword ? 8 : undefined}
          autoComplete={newPassword ? "new-password" : "current-password"}
          aria-describedby={newPassword ? "password-hint" : undefined}
          className={`${inputClass} pr-12`}
        />
        <Button
          type="button"
          variant="ghost"
          size="icon"
          onClick={() => setShow((v) => !v)}
          className="absolute top-1/2 right-1.5 size-9 -translate-y-1/2 text-muted-foreground"
          aria-label={show ? "Hide password" : "Show password"}
        >
          {show ? <EyeOff /> : <Eye />}
        </Button>
      </div>
      {newPassword && (
        <p id="password-hint" className="text-[12px] text-ink-3">
          At least 8 characters.
        </p>
      )}
    </div>
  );
}

export function SubmitButton({ pending, label, pendingLabel }: { pending: boolean; label: string; pendingLabel: string }) {
  return (
    <Button type="submit" disabled={pending} className="h-12 w-full text-[15px] font-semibold">
      {pending && <LoaderCircle className="animate-spin" aria-hidden />}
      {pending ? pendingLabel : label}
    </Button>
  );
}

/** Google's "G", as its sign-in branding guidelines ask. */
function GoogleMark() {
  return (
    <svg viewBox="0 0 48 48" className="size-5" aria-hidden>
      <path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z" />
      <path fill="#FF3D00" d="m6.3 14.7 6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z" />
      <path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-7.9l-6.5 5C9.5 39.6 16.2 44 24 44z" />
      <path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.4-.4-3.5z" />
    </svg>
  );
}

const noSubscription = () => () => {};
const browserTimeZone = () => Intl.DateTimeFormat().resolvedOptions().timeZone;

/**
 * Goes to Google through hisabo's server: a plain form, so it's a full-page redirect (which also works in the
 * home-screen app). Adds the browser's time zone so a new spreadsheet puts dates on the right day.
 */
export function GoogleButton({ intent, label }: { intent: "signin" | "connect"; label: string }) {
  const [pending, setPending] = useState(false);
  // Coming back with the browser's Back button restores this page from cache: un-stick the spinner.
  useEffect(() => {
    const reset = () => setPending(false);
    window.addEventListener("pageshow", reset);
    return () => window.removeEventListener("pageshow", reset);
  }, []);

  // Rendered into the form (empty on the server, filled in after hydration). Setting it in onSubmit doesn't
  // work: the re-render for the spinner resets an uncontrolled hidden input before the browser submits.
  const tz = useSyncExternalStore(noSubscription, browserTimeZone, () => "");

  return (
    <form method="get" action="/api/auth/google" onSubmit={() => setPending(true)}>
      <input type="hidden" name="intent" value={intent} />
      <input type="hidden" name="tz" value={tz} />
      <Button
        type="submit"
        variant={intent === "connect" ? "default" : "outline"}
        disabled={pending}
        className="h-12 w-full gap-2.5 text-[15px] font-semibold"
      >
        {/* Google's mark belongs on a light button; the green Connect button goes without. */}
        {pending ? <LoaderCircle className="animate-spin" aria-hidden /> : intent === "signin" && <GoogleMark />}
        {label}
      </Button>
    </form>
  );
}

export function OrDivider() {
  return (
    <div className="flex items-center gap-3 text-[12px] text-ink-3" role="separator">
      <span className="h-px flex-1 bg-white/8" />
      or
      <span className="h-px flex-1 bg-white/8" />
    </div>
  );
}
