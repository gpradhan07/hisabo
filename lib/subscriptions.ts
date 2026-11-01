import { startOfDay } from "./dates";
import { advance, interval, perMonth, type Interval } from "./recurring";
import type { Expense, Subscription } from "./types";

/** Subscription payments as spending, under the "Subscriptions" category, so they count in totals and charts. */
export const subscriptionExpenses = (list: Subscription[]): Expense[] =>
  list.map((s) => ({
    id: s.id,
    date: s.date,
    amount: s.amount,
    category: "Subscriptions",
    remark: s.remark,
    merchant: s.name,
    ...(s.paymentMethod ? { paymentMethod: s.paymentMethod } : {}),
    ...(s.cardName ? { cardName: s.cardName } : {}),
  }));

export type SubscriptionStatus =
  /** renews automatically */
  | "active"
  /** auto-renew is off: it ends after the period already paid for */
  | "ending"
  /** auto-renew was off and that period is over */
  | "ended"
  | "one-time";

export interface SubscriptionPlan {
  key: string;
  name: string;
  frequency: string;
  interval: Interval | null;
  /** the latest payment */
  amount: number;
  /** the payment before it, to spot a price rise; null after one payment */
  previousAmount: number | null;
  total: number;
  count: number;
  first: Date;
  last: Date;
  /** next renewal (active), or the day it ends (ending/ended); null for one-time */
  next: Date | null;
  autoRenew: boolean;
  status: SubscriptionStatus;
  paymentMethod: string;
  cardName: string;
}

const ORDER: Record<SubscriptionStatus, number> = { active: 0, ending: 1, "one-time": 2, ended: 3 };

/**
 * One entry per subscription name, from its latest payment. An auto-renewing subscription keeps rolling
 * forward even when a renewal wasn't logged, so the next renewal date is never in the past.
 */
export function subscriptionPlans(list: Subscription[], now: Date): SubscriptionPlan[] {
  const today = startOfDay(now);
  const groups = new Map<string, Subscription[]>();
  for (const s of list) {
    const key = s.name.trim().toLowerCase();
    groups.set(key, [...(groups.get(key) ?? []), s]);
  }

  return [...groups.entries()]
    .map(([key, items]): SubscriptionPlan => {
      const sorted = [...items].sort((a, b) => b.date.getTime() - a.date.getTime());
      const latest = sorted[0];
      const iv = interval(latest.frequency);
      let next: Date | null = null;
      let status: SubscriptionStatus = "one-time";
      if (iv) {
        next = advance(latest.date, iv);
        if (latest.autoRenew) {
          for (let n = 2; next < today; n++) next = advance(latest.date, iv, n);
          status = "active";
        } else {
          status = next >= today ? "ending" : "ended";
        }
      }
      return {
        key,
        name: latest.name,
        frequency: latest.frequency,
        interval: iv,
        amount: latest.amount,
        previousAmount: sorted[1]?.amount ?? null,
        total: items.reduce((s, i) => s + i.amount, 0),
        count: items.length,
        first: sorted.at(-1)!.date,
        last: latest.date,
        next,
        autoRenew: latest.autoRenew,
        status,
        paymentMethod: latest.paymentMethod,
        cardName: latest.cardName,
      };
    })
    .sort((a, b) => ORDER[a.status] - ORDER[b.status] || (a.next?.getTime() ?? Infinity) - (b.next?.getTime() ?? Infinity) || b.total - a.total);
}

/** How much the latest payment went up from the one before (over ₹1 and over 5%), else 0. */
export const priceRise = (p: SubscriptionPlan) =>
  p.previousAmount !== null && p.amount - p.previousAmount > Math.max(1, p.previousAmount * 0.05) ? p.amount - p.previousAmount : 0;

/** What the subscriptions that will renew cost per month (a yearly ₹1,499 counts as ₹125). */
export const monthlySubscriptionCost = (plans: SubscriptionPlan[]) =>
  plans.filter((p) => p.status === "active" && p.interval).reduce((s, p) => s + perMonth(p.amount, p.interval!), 0);
