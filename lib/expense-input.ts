/** A manually added expense, as typed into the "Add expense" form. */
export interface ExpenseInput {
  amount: string | number;
  category: string;
  remark?: string;
  /** ISO timestamp built in the browser from the picked date + time (so it's in the user's timezone) */
  date: string;
}

export interface ValidExpense {
  amount: number;
  category: string;
  remark: string;
  date: Date;
}

export type ExpenseErrors = Partial<Record<"amount" | "category" | "remark" | "date", string>>;

const EARLIEST = new Date(2000, 0, 1);

export function validateExpense(input: ExpenseInput, now = new Date()): { ok: true; expense: ValidExpense } | { ok: false; errors: ExpenseErrors } {
  const errors: ExpenseErrors = {};
  const amount = typeof input.amount === "number" ? input.amount : Number(String(input.amount ?? "").replace(/[^0-9.]/g, ""));
  const category = String(input.category ?? "").trim().replace(/\s+/g, " ");
  const remark = String(input.remark ?? "").trim();
  const date = new Date(input.date);

  if (!Number.isFinite(amount) || amount <= 0) errors.amount = "Enter an amount above 0.";
  else if (amount >= 1e8) errors.amount = "That amount looks too large.";
  if (!category) errors.category = "Pick or type a category.";
  else if (category.length > 40) errors.category = "Keep it under 40 characters.";
  if (remark.length > 100) errors.remark = "Keep it under 100 characters.";
  if (Number.isNaN(date.getTime())) errors.date = "Pick a date.";
  else if (date.getTime() > now.getTime() + 10 * 60 * 1000) errors.date = "The date can't be in the future.";
  else if (date < EARLIEST) errors.date = "That date is too far back.";

  if (Object.keys(errors).length) return { ok: false, errors };
  return { ok: true, expense: { amount: Math.round(amount * 100) / 100, category, remark, date } };
}
