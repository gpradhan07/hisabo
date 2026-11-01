import { emiDueInRange, emiProgress, sum } from "./analytics";
import { addMonths, daysBetween, startOfDay } from "./dates";
import { investmentPlans, withAutoInstalments } from "./investments";
import { subscriptionPlans } from "./subscriptions";
import type { Emi, EmiPayment, Expense, Investment, Subscription } from "./types";

// ─── Rent & subscriptions vs day-to-day ───────────────────────

/**
 * Rent and subscriptions are paid every month whatever you do, and one rent payment outweighs weeks of daily
 * spending. Patterns (per day, top category, biggest, weekdays) are worked out from the rest: day-to-day spending.
 * EMIs aren't expenses at all; they live in their own tab.
 */
const FIXED = new Set(["rent", "subscriptions"]);
export const isFixed = (e: Expense) => FIXED.has(e.category.trim().toLowerCase());
export const dayToDay = (list: Expense[]) => list.filter((e) => !isFixed(e));

// ─── Payday ───────────────────────────────────────────────────

/** The pay cycle `now` falls in: from the last payday up to the next one. Short months pay on their last day. */
export function paydayCycle(payday: number, now: Date) {
  const today = startOfDay(now);
  const on = (y: number, m: number) => new Date(y, m, Math.min(payday, new Date(y, m + 1, 0).getDate()));
  const thisMonth = on(today.getFullYear(), today.getMonth());
  const start = thisMonth <= today ? thisMonth : on(today.getFullYear(), today.getMonth() - 1);
  const end = on(start.getFullYear(), start.getMonth() + 1);
  return { start, end, daysLeft: daysBetween(today, end) };
}

// ─── Coming up ────────────────────────────────────────────────

export interface Upcoming {
  date: Date;
  kind: "emi" | "subscription" | "investment";
  name: string;
  amount: number;
  /** "Instalment 3 of 12", "Monthly" */
  detail: string;
}

/** EMI instalments, subscription renewals and SIPs falling due from today up to `until` (exclusive), soonest first. */
export function upcomingPayments({
  emis = [],
  emiPayments = [],
  subscriptions = [],
  investments = [],
  now,
  until,
}: {
  emis?: Emi[];
  emiPayments?: EmiPayment[];
  subscriptions?: Subscription[];
  investments?: Investment[];
  now: Date;
  until: Date;
}): Upcoming[] {
  const today = startOfDay(now);
  const out: Upcoming[] = [];
  const within = (d: Date) => d >= today && d < until;

  for (const emi of emis) {
    if (!emi.startDate) continue;
    // Recorded payments say how many are done; otherwise one counts as paid once its day has passed.
    const p = emiProgress(emi, now, emiPayments);
    for (let k = p.tracked ? p.paidMonths : 0; k < emi.tenure; k++) {
      const due = addMonths(emi.startDate, k);
      if (due >= until) break;
      if (within(due)) out.push({ date: due, kind: "emi", name: emi.name, amount: emi.monthly, detail: `Instalment ${k + 1} of ${emi.tenure}` });
    }
  }
  for (const s of subscriptionPlans(subscriptions, now)) {
    if (s.status === "active" && s.next && within(s.next)) out.push({ date: s.next, kind: "subscription", name: s.name, amount: s.amount, detail: s.frequency });
  }
  for (const i of investmentPlans(investments, now)) {
    if (i.active && within(i.next)) out.push({ date: i.next, kind: "investment", name: i.name, amount: i.amount, detail: i.frequency });
  }
  return out.sort((a, b) => a.date.getTime() - b.date.getTime() || b.amount - a.amount);
}

// ─── Left till payday ─────────────────────────────────────────

/**
 * What's left of this pay cycle's income: income − spent and invested since payday − EMIs due this cycle −
 * renewals and SIPs still to come before the next payday. Facts plus known bills, never a projection.
 */
export function tillPayday({
  income,
  payday,
  expenses,
  emis,
  subscriptions,
  investments,
  now,
}: {
  income: number;
  payday: number;
  expenses: Expense[];
  emis: Emi[];
  subscriptions: Subscription[];
  investments: Investment[];
  now: Date;
}) {
  const cycle = paydayCycle(payday, now);
  const since = (d: Date) => d >= cycle.start && d <= now;
  const spent = sum(expenses.filter((e) => since(e.date)));
  const invested = withAutoInstalments(investments, now)
    .filter((i) => since(i.date))
    .reduce((s, i) => s + i.amount, 0);
  // EMIs live in their own tab (not in expenses), so the whole cycle's instalments count, paid or not.
  const emisDue = emiDueInRange(emis, cycle.start, cycle.end).amount;
  // Renewals and SIPs already paid this cycle are in `spent` (subscriptions) or simply past; only the rest is still due.
  const stillDue = upcomingPayments({ subscriptions, investments, now, until: cycle.end }).reduce((s, u) => s + u.amount, 0);
  const committed = emisDue + stillDue;
  const left = income - spent - invested - committed;
  return { left, perDay: Math.max(0, left) / Math.max(1, cycle.daysLeft), daysLeft: cycle.daysLeft, spent, invested, committed, payday: cycle.end };
}
