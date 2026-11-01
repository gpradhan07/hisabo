"use client";

import { ChevronRight, ExternalLink, FileSpreadsheet, LoaderCircle, Smartphone, Trash2 } from "lucide-react";
import Link from "next/link";
import { useState, useTransition, type SubmitEvent, type ReactNode } from "react";
import { toast } from "sonner";
import { deleteMyAccount } from "@/app/(dashboard)/actions";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { ProfileErrors } from "@/lib/profile";
import { cn } from "@/lib/utils";
import { currencySymbol } from "@/lib/format";
import { forgetCachedData } from "@/lib/local-data";
import { useDashboard } from "./data-provider";

/** Name (required) plus optional details that make the dashboard more personal. */
export function ProfileDialog() {
  const { profileOpen, setProfileOpen, profile, config, sheetUrl } = useDashboard();
  const [deleting, setDeleting] = useState(false);
  const openChange = (open: boolean) => {
    setProfileOpen(open);
    if (!open) setDeleting(false);
  };
  return (
    <Dialog open={profileOpen} onOpenChange={openChange}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto rounded-xl sm:max-w-lg">
        {deleting ? (
          <DeleteAccount onCancel={() => setDeleting(false)} />
        ) : (
          <>
            <DialogHeader>
              <DialogTitle className="text-[20px] font-semibold tracking-tight">{profile ? "Your profile" : "Welcome! What should we call you?"}</DialogTitle>
              <DialogDescription>Only your name is required. The rest is optional and makes your dashboard more useful.</DialogDescription>
            </DialogHeader>
            {/* Remount on each open so the fields start from the saved profile */}
            {profileOpen && <ProfileForm onDone={() => setProfileOpen(false)} />}
            {/* Phones have no sidebar: this is their way to the Add to iPhone page. */}
            {config.hosted && profile && (
              <Link
                href="/add-to-iphone"
                onClick={() => setProfileOpen(false)}
                className="flex items-center gap-3 rounded-lg border px-3 py-2.5 text-[14px] font-medium transition-colors hover:bg-muted md:hidden"
              >
                <Smartphone className="size-4.5 text-brand-ink" aria-hidden />
                Add hisabo to your iPhone
                <ChevronRight className="ml-auto size-4 text-muted-foreground" aria-hidden />
              </Link>
            )}
            {/* Hosted mode: everything lives in the user's own spreadsheet; one tap opens it. */}
            {sheetUrl && (
              <a
                href={sheetUrl}
                target="_blank"
                rel="noreferrer"
                className="flex items-center gap-3 rounded-lg border px-3 py-2.5 text-[14px] font-medium transition-colors hover:bg-muted"
              >
                <FileSpreadsheet className="size-4.5 text-brand-ink" aria-hidden />
                Open my Google Sheet
                <ExternalLink className="ml-auto size-4 text-muted-foreground" aria-hidden />
              </a>
            )}
            {config.hosted && (
              <button
                type="button"
                onClick={() => setDeleting(true)}
                className="flex items-center gap-3 rounded-lg border px-3 py-2.5 text-left text-[14px] font-medium text-bad transition-colors hover:bg-bad-soft"
              >
                <Trash2 className="size-4.5" aria-hidden />
                Delete my account
                <ChevronRight className="ml-auto size-4 text-muted-foreground" aria-hidden />
              </button>
            )}
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}

/** Says exactly what goes, then deletes the account (server: lib/server/delete-account.ts). */
function DeleteAccount({ onCancel }: { onCancel: () => void }) {
  const [pending, start] = useTransition();
  const remove = () =>
    start(async () => {
      const res = await deleteMyAccount();
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      forgetCachedData();
      // A full page load (not router navigation), so nothing of this account stays in memory, and Back can't return to it.
      window.location.replace(new URL(`/login?deleted=${res.sheetRemoved ? "done" : "sheet-kept"}`, window.location.origin).href);
    });

  return (
    <>
      <DialogHeader>
        <DialogTitle className="text-[20px] font-semibold tracking-tight">Delete your hisabo account?</DialogTitle>
        <DialogDescription>This can&apos;t be undone. You can sign up again any time and start fresh.</DialogDescription>
      </DialogHeader>
      <ul className="grid gap-2.5 text-[14px] text-pretty text-muted-foreground">
        <Gone>Your hisabo sheet moves to your Google Drive trash. Google deletes it for good after 30 days.</Gone>
        <Gone>hisabo loses access to your Google account.</Gone>
        <Gone>Your iPhone keys stop working. Delete the hisabo Shortcut from your iPhone too.</Gone>
        <Gone>Your hisabo login is deleted.</Gone>
      </ul>
      <DialogFooter className="mt-1 gap-2">
        <Button type="button" variant="ghost" size="lg" onClick={onCancel} disabled={pending}>
          Cancel
        </Button>
        <Button type="button" variant="destructive" size="lg" onClick={remove} disabled={pending} className="min-w-40">
          {pending ? <LoaderCircle className="animate-spin" aria-hidden /> : <Trash2 aria-hidden />}
          Delete everything
        </Button>
      </DialogFooter>
    </>
  );
}

function Gone({ children }: { children: ReactNode }) {
  return (
    <li className="flex gap-2.5">
      <span className="mt-1.75 size-1.5 shrink-0 rounded-full bg-bad" aria-hidden />
      {children}
    </li>
  );
}

function ProfileForm({ onDone }: { onDone: () => void }) {
  const { profile, saveProfile, config, fmt } = useDashboard();
  const [errors, setErrors] = useState<ProfileErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  // not from `fmt`: with amounts hidden that would give "₹••••"
  const symbol = currencySymbol(config.currency);

  async function submit(e: SubmitEvent<HTMLFormElement>) {
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
          hint={config.monthlyBudget ? `Default is ${fmt.money(config.monthlyBudget)}.` : "Shows what's left to spend each month. EMIs aren't counted."}
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
