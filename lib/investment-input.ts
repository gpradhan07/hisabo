/** A manually added investment, as typed into the "Add investment" form. */
export interface InvestmentInput {
  amount: string | number;
  type: string;
  frequency: string;
  paymentMethod?: string;
  remark?: string;
  /** ISO timestamp built in the browser from the picked date */
  date: string;
}

export interface ValidInvestment {
  amount: number;
  type: string;
  frequency: string;
  paymentMethod: string;
  remark: string;
  date: Date;
}

/** What the form offers; the value is what goes into the sheet's Frequency column. */
export const FREQUENCIES = [
  { value: "One-Time", label: "One-time" },
  { value: "Monthly", label: "Monthly" },
  { value: "Quarterly", label: "Quarterly" },
  { value: "Yearly", label: "Yearly" },
] as const;

export type InvestmentErrors = Partial<Record<"amount" | "type" | "frequency" | "paymentMethod" | "remark" | "date", string>>;

const EARLIEST = new Date(2000, 0, 1);

export function validateInvestment(
  input: InvestmentInput,
  now = new Date(),
): { ok: true; investment: ValidInvestment } | { ok: false; errors: InvestmentErrors } {
  const errors: InvestmentErrors = {};
  const amount = typeof input.amount === "number" ? input.amount : Number(String(input.amount ?? "").replace(/[^0-9.]/g, ""));
  const type = String(input.type ?? "").trim().replace(/\s+/g, " ");
  const frequency = String(input.frequency ?? "").trim();
  const paymentMethod = String(input.paymentMethod ?? "").trim();
  const remark = String(input.remark ?? "").trim();
  const date = new Date(input.date);

  if (!Number.isFinite(amount) || amount <= 0) errors.amount = "Enter an amount above 0.";
  else if (amount >= 1e9) errors.amount = "That amount looks too large.";
  if (!type) errors.type = "Pick or type where you invested.";
  else if (type.length > 40) errors.type = "Keep it under 40 characters.";
  if (!FREQUENCIES.some((f) => f.value === frequency)) errors.frequency = "Pick how often.";
  if (paymentMethod.length > 30) errors.paymentMethod = "Keep it under 30 characters.";
  if (remark.length > 100) errors.remark = "Keep it under 100 characters.";
  if (Number.isNaN(date.getTime())) errors.date = "Pick a date.";
  else if (date.getTime() > now.getTime() + 10 * 60 * 1000) errors.date = "The date can't be in the future.";
  else if (date < EARLIEST) errors.date = "That date is too far back.";

  if (Object.keys(errors).length) return { ok: false, errors };
  return { ok: true, investment: { amount: Math.round(amount * 100) / 100, type, frequency, paymentMethod, remark, date } };
}
