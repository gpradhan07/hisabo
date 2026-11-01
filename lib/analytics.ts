import { addDays, addMonths, daysBetween, startOfDay, startOfMonth, startOfWeek } from "./dates";
import { fmtDay, fmtMonth, fmtMonthShort, fmtShortDate } from "./format";
import type { Range } from "./periods";
import type { Emi, EmiPayment, Expense } from "./types";

export const inRange = (list: Expense[], start: Date, end: Date) => list.filter((e) => e.date >= start && e.date < end);

export const sum = (list: Expense[]) => list.reduce((acc, e) => acc + e.amount, 0);

export interface CategoryTotal {
  category: string;
  total: number;
  count: number;
  share: number;
}

export function byCategory(list: Expense[]): CategoryTotal[] {
  const map = new Map<string, { total: number; count: number }>();
  for (const e of list) {
    const c = map.get(e.category) ?? { total: 0, count: 0 };
    c.total += e.amount;
    c.count += 1;
    map.set(e.category, c);
  }
  const grand = sum(list) || 1;
  return [...map.entries()]
    .map(([category, v]) => ({ category, ...v, share: v.total / grand }))
    .sort((a, b) => b.total - a.total);
}

export interface Bucket {
  start: Date;
  total: number;
  count: number;
  /** short axis tick */
  tick: string;
  /** full label for tooltip / table */
  label: string;
  future: boolean;
}

export function bucketize(list: Expense[], range: Range, now: Date): Bucket[] {
  const buckets: Bucket[] = [];
  const today = startOfDay(now);

  if (range.granularity === "day") {
    for (let d = range.start; d < range.end; d = addDays(d, 1)) {
      buckets.push({ start: d, total: 0, count: 0, tick: String(d.getDate()), label: fmtDay(d), future: d > today });
    }
    for (const e of list) {
      const b = buckets[daysBetween(range.start, e.date)];
      if (!b) continue;
      b.total += e.amount;
      b.count += 1;
    }
  } else if (range.granularity === "week") {
    const first = startOfWeek(range.start);
    for (let d = first; d < range.end; d = addDays(d, 7)) {
      buckets.push({
        start: d,
        total: 0,
        count: 0,
        tick: fmtShortDate(d),
        label: `Week of ${fmtShortDate(d)}`,
        future: d > today,
      });
    }
    for (const e of list) {
      const b = buckets[Math.floor(daysBetween(first, e.date) / 7)];
      if (!b) continue;
      b.total += e.amount;
      b.count += 1;
    }
  } else {
    const y0 = range.start.getFullYear();
    const m0 = range.start.getMonth();
    const multiYear = range.end.getFullYear() - y0 > 1 || range.id === "all";
    for (let d = range.start; d < range.end; d = addMonths(d, 1)) {
      const tick =
        multiYear && d.getMonth() === 0 ? `${fmtMonthShort(d)} ’${String(d.getFullYear()).slice(2)}` : fmtMonthShort(d);
      buckets.push({ start: d, total: 0, count: 0, tick, label: fmtMonth(d), future: d > today });
    }
    for (const e of list) {
      const b = buckets[(e.date.getFullYear() - y0) * 12 + e.date.getMonth() - m0];
      if (!b) continue;
      b.total += e.amount;
      b.count += 1;
    }
  }
  return buckets;
}

// ─── EMIs ─────────────────────────────────────────────────────

export type EmiStatus = "active" | "upcoming" | "completed" | "unknown";

export interface EmiProgress {
  emi: Emi;
  status: EmiStatus;
  paidMonths: number;
  remainingMonths: number;
  paidAmount: number;
  remainingAmount: number;
  nextDue: Date | null;
  endDate: Date | null;
  /** counted from recorded payments (+ instalments paid before), rather than assumed from the calendar */
  tracked: boolean;
  /** payments recorded in the "EMI Payments" tab */
  recorded: number;
  /** tracked and the next instalment's due date has passed without a recorded payment */
  overdue: boolean;
}

const sameEmi = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase();

/**
 * How far along an EMI is. When payments are recorded (or instalments paid before were entered), those are
 * counted. Otherwise an instalment counts as paid once its due date (start date + n months) has arrived.
 */
export function emiProgress(emi: Emi, now: Date, payments: EmiPayment[] = []): EmiProgress {
  const today = startOfDay(now);
  const mine = payments.filter((p) => sameEmi(p.emiName, emi.name));
  const tracked = emi.paidBefore > 0 || mine.length > 0;

  let paid = 0;
  if (tracked) paid = Math.min(emi.tenure, emi.paidBefore + mine.length);
  else if (emi.startDate) while (paid < emi.tenure && addMonths(emi.startDate, paid) <= today) paid++;

  const paidAmount = tracked ? emi.paidBefore * emi.monthly + mine.reduce((s, p) => s + p.amount, 0) : paid * emi.monthly;
  const nextDue = emi.startDate && paid < emi.tenure ? addMonths(emi.startDate, paid) : null;
  const status: EmiStatus =
    paid >= emi.tenure ? "completed" : !emi.startDate && !tracked ? "unknown" : paid === 0 && (!emi.startDate || emi.startDate > today) ? "upcoming" : "active";

  return {
    emi,
    status,
    paidMonths: paid,
    remainingMonths: emi.tenure - paid,
    paidAmount,
    remainingAmount: Math.max(0, (emi.tenure - paid) * emi.monthly),
    nextDue,
    endDate: emi.startDate ? addMonths(emi.startDate, emi.tenure - 1) : null,
    tracked,
    recorded: mine.length,
    overdue: tracked && !!nextDue && nextDue < today,
  };
}

/** EMI instalments falling due within [start, end) */
export function emiDueInRange(emis: Emi[], start: Date, end: Date) {
  let amount = 0;
  let count = 0;
  for (const emi of emis) {
    if (!emi.startDate) continue;
    for (let k = 0; k < emi.tenure; k++) {
      const due = addMonths(emi.startDate, k);
      if (due >= end) break;
      if (due < start) continue;
      amount += emi.monthly;
      count += 1;
    }
  }
  return { amount, count };
}

// ─── Pace (running totals) ────────────────────────────────────

/** Running total per day from `start` for `days` days. Values after `until` (exclusive) are null. */
export function cumulativeByDay(list: Expense[], start: Date, days: number, until: Date): (number | null)[] {
  const daily = new Array<number>(days).fill(0);
  for (const e of list) {
    const i = daysBetween(start, e.date);
    if (i >= 0 && i < days) daily[i] += e.amount;
  }
  const last = daysBetween(start, until) - 1;
  let run = 0;
  return daily.map((v, i) => {
    run += v;
    return i <= last ? run : null;
  });
}

// ─── Patterns ─────────────────────────────────────────────────

export const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

/** Average spend per weekday across the days that have elapsed in [start, end). */
export function weekdayAverages(list: Expense[], start: Date, end: Date) {
  const totals = new Array<number>(7).fill(0);
  const days = new Array<number>(7).fill(0);
  for (let d = start; d < end; d = addDays(d, 1)) days[(d.getDay() + 6) % 7]++;
  for (const e of list) totals[(e.date.getDay() + 6) % 7] += e.amount;
  return totals.map((total, i) => ({ day: WEEKDAYS[i], total, avg: days[i] ? total / days[i] : 0, days: days[i] }));
}

/** Most frequent places/remarks by money spent. */
/** Where the money goes most: by merchant when one was entered ("Swiggy"), else by note. */
export function topRemarks(list: Expense[], n = 6) {
  const map = new Map<string, { name: string; total: number; count: number; category: string }>();
  for (const e of list) {
    const name = (e.merchant || e.remark).trim();
    if (!name) continue;
    const key = name.toLowerCase();
    const r = map.get(key) ?? { name, total: 0, count: 0, category: e.category };
    r.total += e.amount;
    r.count += 1;
    map.set(key, r);
  }
  return [...map.values()].sort((a, b) => b.total - a.total).slice(0, n);
}

export const NOT_RECORDED = "Not recorded";

/** How an expense was paid, one label per card: "UPI (Credit Card) · Kotak CC", "Cash", "Not recorded". */
export function paymentLabel(e: Expense) {
  const method = e.paymentMethod?.trim() || "";
  const card = e.cardName?.trim() || "";
  return !method ? NOT_RECORDED : card ? `${method} · ${card}` : method;
}

/** Spending by how it was paid; card payments are split per card. Unrecorded last. */
export function byPaymentMethod(list: Expense[]) {
  const map = new Map<string, { label: string; total: number; count: number }>();
  for (const e of list) {
    const label = paymentLabel(e);
    const r = map.get(label.toLowerCase()) ?? { label, total: 0, count: 0 };
    r.total += e.amount;
    r.count += 1;
    map.set(label.toLowerCase(), r);
  }
  const grand = sum(list) || 1;
  return [...map.values()]
    .map((r) => ({ ...r, share: r.total / grand, recorded: r.label !== NOT_RECORDED }))
    .sort((a, b) => Number(b.recorded) - Number(a.recorded) || b.total - a.total);
}

export interface CategoryChange extends CategoryTotal {
  prevTotal: number;
  /** relative change vs the previous period; null when there was nothing before */
  change: number | null;
}

export function compareCategories(current: Expense[], previous: Expense[]): CategoryChange[] {
  const prev = new Map(byCategory(previous).map((c) => [c.category, c.total]));
  return byCategory(current).map((c) => {
    const prevTotal = prev.get(c.category) ?? 0;
    return { ...c, prevTotal, change: prevTotal ? (c.total - prevTotal) / prevTotal : null };
  });
}

// ─── Categories over time ─────────────────────────────────────

export const MAX_SERIES = 5;

/**
 * Stable colour slot per category, decided by all-time spend, so a category keeps
 * its colour whatever period or filter is selected. Categories past the fifth share "Other".
 */
export function categorySlots(all: Expense[]): Map<string, number> {
  return new Map(
    byCategory(all)
      .slice(0, MAX_SERIES)
      .map((c, i) => [c.category, i]),
  );
}

export interface MonthStack {
  start: Date;
  tick: string;
  label: string;
  total: number;
  /** one value per slot (0..MAX_SERIES-1), then "Other" last */
  parts: number[];
}

export function monthlyStacks(all: Expense[], slots: Map<string, number>, months: number, now: Date): MonthStack[] {
  const first = addMonths(startOfMonth(now), -(months - 1));
  const out: MonthStack[] = [];
  for (let i = 0; i < months; i++) {
    const d = addMonths(first, i);
    out.push({ start: d, tick: fmtMonthShort(d), label: fmtMonth(d), total: 0, parts: new Array(MAX_SERIES + 1).fill(0) });
  }
  for (const e of all) {
    const i = (e.date.getFullYear() - first.getFullYear()) * 12 + e.date.getMonth() - first.getMonth();
    const m = out[i];
    if (!m) continue;
    m.parts[slots.get(e.category) ?? MAX_SERIES] += e.amount;
    m.total += e.amount;
  }
  return out;
}

// ─── Calendar ─────────────────────────────────────────────────

export function dailyTotals(list: Expense[]) {
  const map = new Map<number, { total: number; count: number }>();
  for (const e of list) {
    const k = startOfDay(e.date).getTime();
    const d = map.get(k) ?? { total: 0, count: 0 };
    d.total += e.amount;
    d.count += 1;
    map.set(k, d);
  }
  return map;
}

// ─── EMI outlook ──────────────────────────────────────────────

/** Total EMI falling due in each of the next `months` calendar months (this month first). */
export function emiOutlook(emis: Emi[], now: Date, months = 12) {
  const first = startOfMonth(now);
  const out = Array.from({ length: months }, (_, i) => {
    const start = addMonths(first, i);
    return { start, tick: fmtMonthShort(start), label: fmtMonth(start), total: 0, loans: [] as { name: string; amount: number }[] };
  });
  for (const emi of emis) {
    if (!emi.startDate) continue;
    const s = startOfMonth(emi.startDate);
    const startIdx = (s.getFullYear() - first.getFullYear()) * 12 + s.getMonth() - first.getMonth();
    for (let k = 0; k < emi.tenure; k++) {
      const m = out[startIdx + k];
      if (!m) continue;
      m.total += emi.monthly;
      m.loans.push({ name: emi.name, amount: emi.monthly });
    }
  }
  return out;
}

/** The day the last running or upcoming EMI gets paid off; null when there are none. */
export function debtFreeDate(progress: EmiProgress[]): Date | null {
  let last: Date | null = null;
  for (const p of progress) {
    if (p.status === "completed" || !p.endDate) continue;
    if (!last || p.endDate > last) last = p.endDate;
  }
  return last;
}
