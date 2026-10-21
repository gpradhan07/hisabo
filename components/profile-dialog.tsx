"use client";

import { LoaderCircle } from "lucide-react";
import { useState, type FormEvent, type ReactNode } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { ProfileErrors } from "@/lib/profile";
import { cn } from "@/lib/utils";
import { currencySymbol } from "@/lib/format";
import { useDashboard } from "./data-provider";

/** Name (required) plus optional details that make the dashboard more personal. */
export function ProfileDialog() {
  const { profileOpen, setProfileOpen, profile } = useDashboard();
  return (
    <Dialog open={profileOpen} onOpenChange={setProfileOpen}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto rounded-xl sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="text-[20px] font-semibold tracking-tight">{profile ? "Your profile" : "Welcome! What should we call you?"}</DialogTitle>
          <DialogDescription>Only your name is required. The rest is optional and makes your dashboard more useful.</DialogDescription>
        </DialogHeader>
        {/* Remount on each open so the fields start from the saved profile */}
        {profileOpen && <ProfileForm onDone={() => setProfileOpen(false)} />}
      </DialogContent>
    </Dialog>
  );
}

function ProfileForm({ onDone }: { onDone: () => void }) {
  const { profile, saveProfile, config, fmt } = useDashboard();
  const [errors, setErrors] = useState<ProfileErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  // not from `fmt`: with amounts hidden that would give "₹••••"
  const symbol = currencySymbol(config.currency);

  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    setPending(true);
    setFormError(null);
    const res = await saveProfile({
      name: String(f.get("name") ?? ""),
      email: String(f.get("email") ?? ""),
      monthlyIncome: String(f.get("monthlyIncome") ?? ""),
      monthlyBudget: String(f.get("monthlyBudget") ?? ""),
      payday: String(f.get("payday") ?? ""),
    });
    setPending(false);
    if (res.ok) {
      toast.success("Profile saved");
      onDone();
      return;
    }
    setErrors(res.fieldErrors ?? {});
    setFormError(res.fieldErrors ? null : res.error);
  }

  return (
    <form onSubmit={submit} noValidate className="grid gap-4">
      <Field id="name" label="Name" required error={errors.name}>
        <Input
          id="name"
          name="name"
          defaultValue={profile?.name}
          autoComplete="name"
          autoFocus
          maxLength={60}
          placeholder="Your name"
          aria-invalid={!!errors.name}
          className="h-11 text-[16px] sm:text-[14px]"
        />
      </Field>

      <Field id="email" label="Email" error={errors.email}>
        <Input
          id="email"
          name="email"
          type="email"
          defaultValue={profile?.email}
          autoComplete="email"
          placeholder="you@example.com"
          aria-invalid={!!errors.email}
          className="h-11 text-[16px] sm:text-[14px]"
        />
      </Field>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field id="monthlyIncome" label="Monthly income" hint="Shows how much of it you've spent." error={errors.monthlyIncome}>
          <Money id="monthlyIncome" symbol={symbol} defaultValue={profile?.monthlyIncome} invalid={!!errors.monthlyIncome} />
        </Field>
        <Field
          id="monthlyBudget"
          label="Monthly budget"
          hint={config.monthlyBudget ? `Default is ${fmt.money(config.monthlyBudget)}.` : "Turns on the budget ring."}
          error={errors.monthlyBudget}
        >
          <Money id="monthlyBudget" symbol={symbol} defaultValue={profile?.monthlyBudget} invalid={!!errors.monthlyBudget} />
        </Field>
      </div>

      <Field id="payday" label="Payday" hint="Day of the month your salary arrives (1–31)." error={errors.payday}>
        <Input
          id="payday"
          name="payday"
          inputMode="numeric"
          defaultValue={profile?.payday}
          placeholder="e.g. 1"
          maxLength={2}
          aria-invalid={!!errors.payday}
          className="h-11 w-28 text-[16px] sm:text-[14px]"
        />
      </Field>

      {formError && (
        <p role="alert" className="rounded-xl border border-bad/30 bg-bad-soft px-3 py-2.5 text-[13px] text-bad">
          {formError}
        </p>
      )}

      <DialogFooter className="mt-1 gap-2">
        <Button type="button" variant="ghost" size="lg" onClick={onDone} disabled={pending}>
          Cancel
        </Button>
        <Button type="submit" size="lg" disabled={pending} className="min-w-28">
          {pending && <LoaderCircle className="animate-spin" aria-hidden />}
          {pending ? "Saving…" : "Save"}
        </Button>
      </DialogFooter>
    </form>
  );
}

function Field({ id, label, required, hint, error, children }: { id: string; label: string; required?: boolean; hint?: string; error?: string; children: ReactNode }) {
  return (
    <div className="grid gap-1.5">
      <Label htmlFor={id} className="text-[13px]">
        {label}
        {required ? (
          <span className="text-bad" aria-hidden>
            *
          </span>
        ) : (
          <span className="font-normal text-muted-foreground">(optional)</span>
        )}
      </Label>
      {children}
      {error ? (
        <p className="text-[12px] text-bad" role="alert">
          {error}
        </p>
      ) : (
        hint && <p className="text-[12px] text-muted-foreground">{hint}</p>
      )}
    </div>
  );
}

function Money({ id, symbol, defaultValue, invalid }: { id: string; symbol: string; defaultValue?: number; invalid: boolean }) {
  return (
    <div className="relative">
      <span className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-[14px] text-muted-foreground">{symbol}</span>
      <Input
        id={id}
        name={id}
        inputMode="decimal"
        defaultValue={defaultValue}
        placeholder="0.00"
        aria-invalid={invalid}
        className={cn("h-11 pl-8 text-[16px] tabular-nums sm:text-[14px]")}
      />
    </div>
  );
}
