/** An EMI added by hand, as typed into the "Add EMI" form. */
export interface EmiInput {
  name: string;
  /** monthly instalment */
  amount: string | number;
  /** number of months */
  tenure: string | number;
  /** first instalment, as YYYY-MM-DD (a calendar date, no time zone) */
  startDate: string;
  paymentMethod?: string;
  cardName?: string;
}

export interface ValidEmi {
  name: string;
  amount: number;
  tenure: number;
  startDate: string;
  paymentMethod: string;
  cardName: string;
}

export type EmiErrors = Partial<Record<"name" | "amount" | "tenure" | "startDate" | "paymentMethod" | "cardName", string>>;

export function validateEmi(input: EmiInput, now = new Date()): { ok: true; emi: ValidEmi } | { ok: false; errors: EmiErrors } {
  const errors: EmiErrors = {};
  const name = String(input.name ?? "").trim().replace(/\s+/g, " ");
  const amount = typeof input.amount === "number" ? input.amount : Number(String(input.amount ?? "").replace(/[^0-9.]/g, ""));
  const tenure = Number(String(input.tenure ?? "").trim());
  const startDate = String(input.startDate ?? "").trim();
  const paymentMethod = String(input.paymentMethod ?? "").trim();
  const cardName = String(input.cardName ?? "").trim();

  if (!name) errors.name = "Give it a name, like the thing you bought.";
  else if (name.length > 40) errors.name = "Keep it under 40 characters.";
  if (!Number.isFinite(amount) || amount <= 0) errors.amount = "Enter the monthly EMI.";
  else if (amount >= 1e8) errors.amount = "That amount looks too large.";
  if (!Number.isInteger(tenure) || tenure <= 0) errors.tenure = "Enter the number of months.";
  else if (tenure > 600) errors.tenure = "That's more than 50 years.";
  const m = startDate.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  const year = m ? +m[1] : NaN;
  if (!m || year < 2000 || year > now.getFullYear() + 10) errors.startDate = "Pick the first instalment date.";
  if (paymentMethod.length > 30) errors.paymentMethod = "Keep it under 30 characters.";
  if (cardName.length > 40) errors.cardName = "Keep it under 40 characters.";

  if (Object.keys(errors).length) return { ok: false, errors };
  return { ok: true, emi: { name, amount: Math.round(amount * 100) / 100, tenure, startDate, paymentMethod, cardName } };
}
