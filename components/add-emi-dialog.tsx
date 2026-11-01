"use client";

import { LoaderCircle } from "lucide-react";
import { useState, type SubmitEvent } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { addMonths, startOfDay } from "@/lib/dates";
import type { EmiErrors } from "@/lib/emi-input";
import { currencySymbol, fmtMonth } from "@/lib/format";
import { Field, FieldLabel, Pill } from "./add-expense-dialog";
import { useDashboard } from "./data-provider";
import { DatePicker } from "./date-time-pickers";

const TENURES = [3, 6, 9, 12, 18, 24, 36];
const PAYMENT_METHODS = ["Auto-debit", "Credit Card", "Debit Card", "UPI", "Net Banking"];
const pad = (n: number) => String(n).padStart(2, "0");
const ymd = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

/** Add an EMI by hand: the same row the Shortcut writes to the EMI tab. */
export function AddEmiDialog() {
  const { emiOpen, setEmiOpen } = useDashboard();
  return (
    <Dialog open={emiOpen} onOpenChange={setEmiOpen}>
      <DialogContent className="max-h-[92dvh] overflow-y-auto rounded-xl sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="text-[20px] font-semibold tracking-tight">Add EMI</DialogTitle>
          <DialogDescription>A phone, a laptop, a bike… anything you’re paying off monthly.</DialogDescription>
        </DialogHeader>
        {emiOpen && <EmiForm onDone={() => setEmiOpen(false)} />}
      </DialogContent>
    </Dialog>
  );
}

function EmiForm({ onDone }: { onDone: () => void }) {
  const { addEmi, fmt, config, demo } = useDashboard();
  // Read the clock once when the form opens (not on every render).
  const [today] = useState(() => startOfDay(new Date()));
  const [amount, setAmount] = useState("");
  const [tenure, setTenure] = useState("");
  const [start, setStart] = useState<Date>(today);
  const [payment, setPayment] = useState("");
  const [errors, setErrors] = useState<EmiErrors>({});
  // A field's error goes away as soon as you change that field.
  const clearError = (field: string) => setErrors((e) => (field in e ? Object.fromEntries(Object.entries(e).filter(([k]) => k !== field)) : e));
  const [formError, setFormError] = useState<string | null>(demo ? "This is demo data. Connect your Google Sheet to add EMIs." : null);
  const [pending, setPending] = useState(false);
  const symbol = currencySymbol(config.currency);
  const withCard = payment === "Credit Card" || payment === "Debit Card";

  // Live summary once both numbers make sense
  const monthly = Number(amount.replace(/[^0-9.]/g, ""));
  const months = Number(tenure);
  const summary =
    monthly > 0 && Number.isInteger(months) && months > 0
      ? `${fmt.moneyExact(monthly * months)} in total · last instalment ${fmtMonth(addMonths(start, months - 1))}`
      : null;

  async function submit(e: SubmitEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const name = String(f.get("name") ?? "");
    const cardName = withCard ? String(f.get("cardName") ?? "") : "";

    setPending(true);
    setFormError(null);
    const res = await addEmi({ name, amount, tenure, startDate: ymd(start), paymentMethod: payment, cardName });
    setPending(false);
    if (!res.ok) {
      setErrors(res.fieldErrors ?? {});
      setFormError(res.fieldErrors ? null : res.error);
      return;
    }
    toast.success(`Added EMI · ${name.trim()}`, { description: `${fmt.moneyExact(monthly)} a month for ${months} months` });
    onDone();
  }

  return (
    <form onSubmit={submit} onChange={(e) => clearError((e.target as HTMLElement).id)} noValidate className="grid gap-5">
      <Field id="name" label="EMI name" required error={errors.name}>
        <Input
          id="name"
          name="name"
          maxLength={40}
          autoComplete="off"
          autoFocus
          placeholder="e.g. iPhone 16 Pro"
          aria-invalid={!!errors.name}
          className="h-11 text-[16px] sm:text-[14px]"
        />
      </Field>

      <Field id="amount" label="Monthly EMI" required error={errors.amount}>
        <div className="relative">
          <span className="pointer-events-none absolute top-1/2 left-3.5 -translate-y-1/2 text-[20px] font-medium text-muted-foreground">
            {symbol}
          </span>
          <Input
            id="amount"
            inputMode="decimal"
            autoComplete="off"
            placeholder="0.00"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            aria-invalid={!!errors.amount}
            className="h-14 pl-10 text-[24px] font-semibold tabular-nums"
          />
        </div>
      </Field>

      <Field id="tenure" label="Tenure (months)" required error={errors.tenure}>
        <div className="flex flex-wrap gap-1.5" role="group" aria-label="Common tenures">
          {TENURES.map((t) => (
            <Pill key={t} active={tenure === String(t)} onClick={() => (setTenure(String(t)), clearError("tenure"))}>
              {t}
            </Pill>
          ))}
        </div>
        <Input
          id="tenure"
          inputMode="numeric"
          autoComplete="off"
          placeholder="Or type the number of months"
          value={tenure}
          onChange={(e) => setTenure(e.target.value.replace(/[^0-9]/g, ""))}
          aria-invalid={!!errors.tenure}
          className="mt-1 h-11 text-[16px] sm:text-[14px]"
        />
      </Field>

      <div className="grid gap-1.5">
        <FieldLabel htmlFor="start" label="First instalment" required />
        <DatePicker id="start" value={start} onChange={(d) => (setStart(d), clearError("startDate"))} today={today} invalid={!!errors.startDate} allowFuture />
        {errors.startDate ? (
          <p className="text-[12px] text-bad" role="alert">
            {errors.startDate}
          </p>
        ) : (
          summary && <p className="text-[12px] text-muted-foreground">{summary}</p>
        )}
      </div>

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

      {withCard && (
        <Field id="cardName" label="Card name" error={errors.cardName}>
          <Input
            id="cardName"
            name="cardName"
            maxLength={40}
            autoComplete="off"
            placeholder="e.g. HDFC Millennia"
            aria-invalid={!!errors.cardName}
            className="h-11 text-[16px] sm:text-[14px]"
          />
        </Field>
      )}

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
          {pending ? "Saving…" : "Add EMI"}
        </Button>
      </DialogFooter>
    </form>
  );
}
