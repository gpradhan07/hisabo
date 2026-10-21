"use client";

import { LoaderCircle } from "lucide-react";
import { createElement, useState, type FormEvent, type ReactNode } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { EXPENSE_CATEGORIES, categoryIcon } from "@/lib/categories";
import { isSameDay, startOfDay } from "@/lib/dates";
import type { ExpenseErrors } from "@/lib/expense-input";
import { currencySymbol, fmtDay } from "@/lib/format";
import { cn } from "@/lib/utils";
import { useDashboard } from "./data-provider";
import { DatePicker, TimePicker } from "./date-time-pickers";
import { SuggestInput } from "./suggest-input";

const pad = (n: number) => String(n).padStart(2, "0");

/** Manually log an expense (any past date), saved to the sheet like the Shortcut's. */
export function AddExpenseDialog() {
  const { addOpen, setAddOpen } = useDashboard();
  return (
    <Dialog open={addOpen} onOpenChange={setAddOpen}>
      <DialogContent className="max-h-[92dvh] overflow-y-auto rounded-xl sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="text-[20px] font-semibold tracking-tight">Add expense</DialogTitle>
          <DialogDescription>Log something you forgot, on the day it actually happened.</DialogDescription>
        </DialogHeader>
        {addOpen && <ExpenseForm onDone={() => setAddOpen(false)} />}
      </DialogContent>
    </Dialog>
  );
}

function ExpenseForm({ onDone }: { onDone: () => void }) {
  const { addExpense, fmt, config, demo } = useDashboard();
  // Read the clock once when the form opens (not on every render).
  const [opened] = useState(() => new Date());
  const today = startOfDay(opened);
  const [category, setCategory] = useState("");
  const [day, setDay] = useState<Date>(today);
  const [time, setTime] = useState(() => `${pad(opened.getHours())}:${pad(opened.getMinutes())}`);
  const [errors, setErrors] = useState<ExpenseErrors>({});
  // A field's error goes away as soon as you change that field.
  const clearError = (field: string) => setErrors((e) => (field in e ? Object.fromEntries(Object.entries(e).filter(([k]) => k !== field)) : e));
  const [formError, setFormError] = useState<string | null>(demo ? "This is demo data. Connect your Google Sheet to add expenses." : null);
  const [pending, setPending] = useState(false);
  // not from `fmt`: with amounts hidden that would give "₹••••"
  const symbol = currencySymbol(config.currency);

  // If you pick a time later than now for today, move it back to now.
  const pickDay = (d: Date) => {
    setDay(d);
    if (isSameDay(d, opened)) {
      const [h, m] = time.split(":").map(Number);
      if (h * 60 + m > opened.getHours() * 60 + opened.getMinutes()) setTime(`${pad(opened.getHours())}:${pad(opened.getMinutes())}`);
    }
  };

  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const [hh, mm] = time.split(":").map(Number);
    const when = new Date(day.getFullYear(), day.getMonth(), day.getDate(), hh || 0, mm || 0);
    const amount = String(f.get("amount") ?? "");
    const remark = String(f.get("remark") ?? "");

    setPending(true);
    setFormError(null);
    const res = await addExpense({ amount, category, remark, date: when.toISOString() });
    setPending(false);
    if (!res.ok) {
      setErrors(res.fieldErrors ?? {});
      setFormError(res.fieldErrors ? null : res.error);
      return;
    }
    toast.success(`Added ${fmt.moneyExact(Number(amount.replace(/[^0-9.]/g, "")))} · ${category.trim()}`, {
      description: isSameDay(when, new Date()) ? "Today" : `Filed under ${fmtDay(when)}`,
    });
    onDone();
  }

  return (
    <form onSubmit={submit} onChange={(e) => clearError((e.target as HTMLElement).id)} noValidate className="grid gap-5">
      <Field id="amount" label="Amount" required error={errors.amount}>
        <div className="relative">
          <span className="pointer-events-none absolute top-1/2 left-3.5 -translate-y-1/2 text-[20px] font-medium text-muted-foreground">
            {symbol}
          </span>
          <Input
            id="amount"
            name="amount"
            inputMode="decimal"
            autoComplete="off"
            autoFocus
            placeholder="0.00"
            aria-invalid={!!errors.amount}
            className="h-14 pl-10 text-[24px] font-semibold tabular-nums"
          />
        </div>
      </Field>

      <Field id="category" label="Category" required error={errors.category}>
        <div className="flex flex-wrap gap-1.5" role="group" aria-label="Categories">
          {EXPENSE_CATEGORIES.map((c) => (
            <Pill key={c} active={category.trim().toLowerCase() === c.toLowerCase()} onClick={() => (setCategory(c), clearError("category"))}>
              {createElement(categoryIcon(c), { className: "size-3.5", "aria-hidden": true })}
              {c}
            </Pill>
          ))}
        </div>
        <SuggestInput
          id="category"
          value={category}
          onChange={(v) => (setCategory(v), clearError("category"))}
          suggestions={EXPENSE_CATEGORIES}
          icon={categoryIcon}
          maxLength={40}
          placeholder="Or type your own"
          invalid={!!errors.category}
          className="mt-1"
        />
      </Field>

      <Field id="remark" label="Note" error={errors.remark}>
        <Input
          id="remark"
          name="remark"
          maxLength={100}
          autoComplete="off"
          placeholder="e.g. Dinner with friends"
          aria-invalid={!!errors.remark}
          className="h-11 text-[16px] sm:text-[14px]"
        />
      </Field>

      {/* Labels and boxes share one grid so the date and time line up exactly */}
      <div className="grid grid-cols-[minmax(0,1fr)_7.75rem] gap-x-3 gap-y-1.5 sm:grid-cols-[minmax(0,1fr)_10rem]">
        <FieldLabel htmlFor="date" label="Date" required />
        <FieldLabel htmlFor="time" label="Time" />
        <DatePicker id="date" value={day} onChange={(d) => (pickDay(d), clearError("date"))} today={today} invalid={!!errors.date} />
        <TimePicker id="time" value={time} onChange={setTime} maxTime={isSameDay(day, opened) ? opened : null} />
        {errors.date && (
          <p className="col-span-2 text-[12px] text-bad" role="alert">
            {errors.date}
          </p>
        )}
      </div>

      {formError && (
        <p role="alert" className="rounded-xl border border-bad/30 bg-bad-soft px-3 py-2.5 text-[13px] text-bad">
          {formError}
        </p>
      )}

      <DialogFooter className="gap-2">
        <Button type="button" variant="ghost" size="lg" onClick={onDone} disabled={pending}>
          Cancel
        </Button>
        <Button type="submit" size="lg" disabled={pending || demo} className="min-w-32">
          {pending && <LoaderCircle className="animate-spin" aria-hidden />}
          {pending ? "Saving…" : "Add expense"}
        </Button>
      </DialogFooter>
    </form>
  );
}

export function Pill({ active, onClick, children }: { active: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        "inline-flex h-8 items-center gap-1.5 rounded-full border px-3 text-[12px] font-medium transition-colors",
        active ? "border-brand bg-brand-soft text-brand-ink" : "border-border text-muted-foreground hover:bg-muted hover:text-foreground",
      )}
    >
      {children}
    </button>
  );
}

export function FieldLabel({ htmlFor, label, required }: { htmlFor: string; label: string; required?: boolean }) {
  return (
    <Label htmlFor={htmlFor} className="text-[13px]">
      {label}
      {required ? (
        <span className="text-bad" aria-hidden>
          *
        </span>
      ) : (
        <span className="font-normal text-muted-foreground">(optional)</span>
      )}
    </Label>
  );
}

export function Field({ id, label, required, error, children }: { id: string; label: string; required?: boolean; error?: string; children: ReactNode }) {
  return (
    <div className="grid content-start gap-1.5">
      <FieldLabel htmlFor={id} label={label} required={required} />
      {children}
      {error && (
        <p className="text-[12px] text-bad" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
