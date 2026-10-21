export interface Formatters {
  /** Always two decimals: 1234 → ₹1,234.00 */
  money: (n: number) => string;
  /** Same as `money` (kept for call sites that format a single transaction) */
  moneyExact: (n: number) => string;
  /** Axis / tight spaces, still two decimals: ₹12.35K, ₹1.25L (under 1,000: ₹850.00) */
  moneyCompact: (n: number) => string;
  percent: (n: number) => string;
  /** true while privacy mode hides amounts */
  hidden: boolean;
}

/** Just the currency sign (₹ for INR), whatever the privacy mode. Used as the prefix in amount inputs. */
export function currencySymbol(currency: string): string {
  const locale = currency === "INR" ? "en-IN" : undefined;
  try {
    return new Intl.NumberFormat(locale, { style: "currency", currency }).formatToParts(0).find((p) => p.type === "currency")?.value ?? currency;
  } catch {
    return currency;
  }
}

/** Privacy mode: every amount becomes "₹ ••••" (counts and percentages of spend stay visible). */
export function makeFormatters(currency: string, hidden = false): Formatters {
  const locale = currency === "INR" ? "en-IN" : undefined;
  const base = { style: "currency", currency } as const;
  const exact = new Intl.NumberFormat(locale, { ...base, minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const compact = new Intl.NumberFormat(locale, { ...base, notation: "compact", minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const pct = new Intl.NumberFormat(locale, { style: "percent", maximumFractionDigits: 0 });

  if (hidden) {
    const symbol = exact.formatToParts(0).find((part) => part.type === "currency")?.value ?? "";
    return {
      money: () => `${symbol}••••`,
      moneyExact: () => `${symbol}••••`,
      moneyCompact: () => `${symbol}•••`,
      percent: (n) => pct.format(n),
      hidden: true,
    };
  }

  return {
    money: (n) => exact.format(n),
    moneyExact: (n) => exact.format(n),
    moneyCompact: (n) => (Math.abs(n) < 1000 ? exact.format(n) : compact.format(n)),
    percent: (n) => pct.format(n),
    hidden: false,
  };
}

const dayFmt = new Intl.DateTimeFormat(undefined, { weekday: "short", day: "numeric", month: "short" });
const dateFmt = new Intl.DateTimeFormat(undefined, { day: "numeric", month: "short", year: "numeric" });
const shortDateFmt = new Intl.DateTimeFormat(undefined, { day: "numeric", month: "short" });
const monthFmt = new Intl.DateTimeFormat(undefined, { month: "short", year: "numeric" });
const monthShortFmt = new Intl.DateTimeFormat(undefined, { month: "short" });
const timeFmt = new Intl.DateTimeFormat(undefined, { hour: "numeric", minute: "2-digit" });

export const fmtDay = (d: Date) => dayFmt.format(d);
export const fmtDate = (d: Date) => dateFmt.format(d);
export const fmtShortDate = (d: Date) => shortDateFmt.format(d);
export const fmtMonth = (d: Date) => monthFmt.format(d);
export const fmtMonthShort = (d: Date) => monthShortFmt.format(d);
export const fmtTime = (d: Date) => timeFmt.format(d);

export function fmtRelative(d: Date, now = new Date()): string {
  const s = Math.round((now.getTime() - d.getTime()) / 1000);
  if (s < 45) return "just now";
  const m = Math.round(s / 60);
  if (m < 60) return `${m} min ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h} hr ago`;
  return fmtShortDate(d);
}
