import { addDays, addMonths } from "./dates";

/** How far apart repeating payments are. Weekly counts in days so it doesn't drift; the rest in calendar months. */
export type Interval = { days: number } | { months: number };

/** Weekly / Monthly / Quarterly / Half-yearly / Yearly → its interval; null for one-time (or unknown). */
export function interval(frequency: string): Interval | null {
  switch (frequency) {
    case "Weekly":
      return { days: 7 };
    case "Monthly":
      return { months: 1 };
    case "Quarterly":
      return { months: 3 };
    case "Half-yearly":
      return { months: 6 };
    case "Yearly":
      return { months: 12 };
    default:
      return null;
  }
}

/** `date` moved on by `n` intervals. */
export const advance = (date: Date, iv: Interval, n = 1): Date => ("days" in iv ? addDays(date, iv.days * n) : addMonths(date, iv.months * n));

/** What one payment of `amount` comes to per month (₹12,000 yearly → ₹1,000; ₹100 weekly → ₹433). */
export const perMonth = (amount: number, iv: Interval) => ("days" in iv ? (amount * 365.25) / 12 / iv.days : amount / iv.months);

/** "month", "3 months", "week" — for "₹649 per month". */
export function per(iv: Interval): string {
  if ("days" in iv) return iv.days === 7 ? "week" : `${iv.days} days`;
  return iv.months === 1 ? "month" : iv.months === 12 ? "year" : `${iv.months} months`;
}
