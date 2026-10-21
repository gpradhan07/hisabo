"use client";

import { CircleAlert, Eye, EyeOff, LoaderCircle, LockKeyhole, UserRound } from "lucide-react";
import { useSearchParams } from "next/navigation";
import { useActionState, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { login } from "./actions";

const inputClass = "h-12 pl-10 text-[16px] sm:text-[15px]";

export function LoginForm() {
  const [state, action, pending] = useActionState(login, undefined);
  const [show, setShow] = useState(false);
  const next = useSearchParams().get("next") ?? "/";

  return (
    <form action={action} className="mt-8 space-y-5">
      <input type="hidden" name="next" value={next} />

      <div className="space-y-2">
        <Label htmlFor="username">Username</Label>
        <div className="relative">
          <UserRound className="pointer-events-none absolute top-1/2 left-3.5 size-4.5 -translate-y-1/2 text-muted-foreground" aria-hidden />
          <Input
            id="username"
            name="username"
            required
            autoComplete="username"
            autoCapitalize="none"
            spellCheck={false}
            defaultValue={state?.username}
            className={inputClass}
          />
        </div>
      </div>

      <div className="space-y-2">
        <Label htmlFor="password">Password</Label>
        <div className="relative">
          <LockKeyhole className="pointer-events-none absolute top-1/2 left-3.5 size-4.5 -translate-y-1/2 text-muted-foreground" aria-hidden />
          <Input id="password" name="password" type={show ? "text" : "password"} required autoComplete="current-password" className={`${inputClass} pr-12`} />
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
      </div>

      {state?.error && (
        <p role="alert" className="flex items-start gap-2 rounded-lg border border-bad/30 bg-bad-soft px-3 py-2.5 text-[13px] text-bad">
          <CircleAlert className="mt-0.5 size-4 shrink-0" aria-hidden />
          {state.error}
        </p>
      )}

      <Button type="submit" disabled={pending} className="h-12 w-full text-[15px] font-semibold">
        {pending && <LoaderCircle className="animate-spin" aria-hidden />}
        {pending ? "Signing in…" : "Sign in"}
      </Button>
    </form>
  );
}
