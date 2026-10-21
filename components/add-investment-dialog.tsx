"use client";

import { LoaderCircle } from "lucide-react";
import { createElement, useMemo, useState, type FormEvent } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { isSameDay, startOfDay } from "@/lib/dates";
import { currencySymbol, fmtDay } from "@/lib/format";
import { FREQUENCIES, type InvestmentErrors } from "@/lib/investment-input";
import { investmentIcon } from "@/lib/investments";
import { Field, FieldLabel, Pill } from "./add-expense-dialog";
import { useDashboard } from "./data-provider";
import { DatePicker } from "./date-time-pickers";
import { SuggestInput } from "./suggest-input";
import { Segmented } from "./kit";

/** Common places to invest, offered after the ones you already use. */
const COMMON_TYPES = ["Mutual Fund", "Stocks", "Gold", "PPF", "NPS", "FD", "RD", "Bonds", "EPF", "Crypto"];
const PAYMENT_METHODS = ["UPI", "Auto-debit", "Net Banking", "Debit Card", "Credit Card", "Cash"];

type Frequency = (typeof FREQUENCIES)[number]["value"];

/** Manually log an investment (any past date), saved to the sheet's Investments tab. */
export function AddInvestmentDialog() {
  const { investOpen, setInvestOpen } = useDashboard();
  return (
    <Dialog open={investOpen} onOpenChange={setInvestOpen}>
      <DialogContent className="max-h-[92dvh] overflow-y-auto rounded-xl sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="text-[20px] font-semibold tracking-tight">Add investment</DialogTitle>
          <DialogDescription>A SIP instalment, a stock you bought, a PPF top-up…</DialogDescription>
        </DialogHeader>
        {investOpen && <InvestmentForm onDone={() => setInvestOpen(false)} />}
      </DialogContent>
    </Dialog>
  );
}

function InvestmentForm({ onDone }: { onDone: () => void }) {
  const { data, addInvestment, fmt, config, demo } = useDashboard();
  // Read the clock once when the form opens (not on every render).
  const [opened] = useState(() => new Date());
  const today = startOfDay(opened);
  const [type, setType] = useState("");
  const [frequency, setFrequency] = useState<Frequency>("Monthly");
  const [payment, setPayment] = useState("");
  const [day, setDay] = useState<Date>(today);
  const [errors, setErrors] = useState<InvestmentErrors>({});
  // A field's error goes away as soon as you change that field.
  const clearError = (field: string) => setErrors((e) => (field in e ? Object.fromEntries(Object.entries(e).filter(([k]) => k !== field)) : e));
  const [formError, setFormError] = useState<string | null>(demo ? "This is demo data. Connect your Google Sheet to add investments." : null);
  const [pending, setPending] = useState(false);
  // not from `fmt`: with amounts hidden that would give "₹••••"
  const symbol = currencySymbol(config.currency);

  // Your types (most used first), then common ones you haven't used yet.
  // The pills show the first 12; the dropdown under "Or type your own" searches all of them.
  const allTypes = useMemo(() => {
    const count = new Map<string, number>();
    for (const i of data?.investments ?? []) count.set(i.type, (count.get(i.type) ?? 0) + 1);
    const yours = [...count.entries()].sort((a, b) => b[1] - a[1]).map(([t]) => t);
    const seen = new Set(yours.map((t) => t.toLowerCase()));
    return [...yours, ...COMMON_TYPES.filter((t) => !seen.has(t.toLowerCase()))];
  }, [data]);
  const types = allTypes.slice(0, 12);

  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    // Today → right now; an earlier day → midday, so it never lands on the wrong date.
    const when = isSameDay(day, opened) ? new Date() : new Date(day.getFullYear(), day.getMonth(), day.getDate(), 12);
    const amount = String(f.get("amount") ?? "");
    const remark = String(f.get("remark") ?? "");

    setPending(true);
    setFormError(null);
    const res = await addInvestment({ amount, type, frequency, paymentMethod: payment, remark, date: when.toISOString() });
    setPending(false);
    if (!res.ok) {
      setErrors(res.fieldErrors ?? {});
      setFormError(res.fieldErrors ? null : res.error);
      return;
    }
    toast.success(`Added ${fmt.moneyExact(Number(amount.replace(/[^0-9.]/g, "")))} · ${type.trim()}`, {
      description: [FREQUENCIES.find((x) => x.value === frequency)?.label, isSameDay(when, new Date()) ? "Today" : fmtDay(when)].join(" · "),
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

      <Field id="type" label="Invested in" required error={errors.type}>
        <div className="flex flex-wrap gap-1.5" role="group" aria-label="Investment types">
          {types.map((t) => (
            <Pill key={t} active={type.trim().toLowerCase() === t.toLowerCase()} onClick={() => (setType(t), clearError("type"))}>
              {createElement(investmentIcon(t), { className: "size-3.5", "aria-hidden": true })}
              {t}
            </Pill>
          ))}
        </div>
        <SuggestInput
          id="type"
          value={type}
          onChange={(v) => (setType(v), clearError("type"))}
          suggestions={allTypes}
          icon={investmentIcon}
          maxLength={40}
          placeholder="Or type your own"
          invalid={!!errors.type}
          className="mt-1"
        />
      </Field>

      <div className="grid gap-1.5">
        <FieldLabel htmlFor="frequency" label="How often" required />
        <div id="frequency">
          <Segmented label="How often" value={frequency} onChange={setFrequency} options={FREQUENCIES.map((x) => ({ value: x.value, label: x.label }))} stretch />
        </div>
        {errors.frequency && (
          <p className="text-[12px] text-bad" role="alert">
            {errors.frequency}
          </p>
        )}
      </div>

      <Field id="remark" label="Fund or note" error={errors.remark}>
        <Input
          id="remark"
          name="remark"
          maxLength={100}
          autoComplete="off"
          placeholder="e.g. Parag Parikh Flexi Cap"
          aria-invalid={!!errors.remark}
          className="h-11 text-[16px] sm:text-[14px]"
        />
      </Field>

      <div className="grid gap-1.5">
        <FieldLabel htmlFor="payment" label="Paid with" />
        <div id="payment" className="flex flex-wrap gap-1.5" role="group" aria-label="Payment method">
          {PAYMENT_METHODS.map((m) => (
            <Pill key={m} active={payment === m} onClick={() => setPayment(payment === m ? "" : m)}>
              {m}
            </Pill>
          ))}
        </div>
      </div>

      <div className="grid gap-1.5">
        <FieldLabel htmlFor="date" label="Date" required />
        <DatePicker id="date" value={day} onChange={(d) => (setDay(d), clearError("date"))} today={today} invalid={!!errors.date} />
        {errors.date && (
          <p className="text-[12px] text-bad" role="alert">
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
        <Button type="submit" size="lg" disabled={pending || demo} className="min-w-36">
          {pending && <LoaderCircle className="animate-spin" aria-hidden />}
          {pending ? "Saving…" : "Add investment"}
        </Button>
      </DialogFooter>
    </form>
  );
}
