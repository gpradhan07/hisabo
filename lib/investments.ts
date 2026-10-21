import {
  Bitcoin,
  Building2,
  ChartCandlestick,
  ChartPie,
  Coins,
  Gem,
  House,
  Landmark,
  PiggyBank,
  ScrollText,
  TrendingUp,
  Vault,
  type LucideIcon,
} from "lucide-react";
import { addMonths } from "./dates";
import type { Expense, Investment } from "./types";

/** Investments shaped like expenses (type → category), so the shared chart helpers work on them. */
export const asSeries = (list: Investment[]): Expense[] =>
  list.map((i) => ({ id: i.id, date: i.date, amount: i.amount, category: i.type, remark: i.remark }));

/** Months between instalments for each recurring frequency; null for one-time. */
export function stepMonths(frequency: string): number | null {
  switch (frequency) {
    case "Monthly":
      return 1;
    case "Quarterly":
      return 3;
    case "Half-yearly":
      return 6;
    case "Yearly":
      return 12;
    default:
      return null;
  }
}

export interface Plan {
  key: string;
  /** the remark (fund / scheme name) or the type when there's no remark */
  name: string;
  type: string;
  frequency: string;
  step: number;
  /** most recent instalment */
  amount: number;
  total: number;
  count: number;
  first: Date;
  last: Date;
  next: Date;
  /** false once it has missed more than one instalment (probably stopped) */
  active: boolean;
  paymentMethod: string;
}

/** Recurring investments (SIPs etc.), one per type + remark, biggest first. */
export function investmentPlans(list: Investment[], now: Date): Plan[] {
  const groups = new Map<string, Investment[]>();
  for (const i of list) {
    if (!stepMonths(i.frequency)) continue;
    const key = `${i.type}|${i.remark.toLowerCase()}`;
    groups.set(key, [...(groups.get(key) ?? []), i]);
  }
  return [...groups.entries()]
    .map(([key, items]) => {
      const sorted = [...items].sort((a, b) => b.date.getTime() - a.date.getTime());
      const latest = sorted[0];
      const step = stepMonths(latest.frequency)!;
      const next = addMonths(latest.date, step);
      return {
        key,
        name: latest.remark || latest.type,
        type: latest.type,
        frequency: latest.frequency,
        step,
        amount: latest.amount,
        total: items.reduce((s, i) => s + i.amount, 0),
        count: items.length,
        first: sorted.at(-1)!.date,
        last: latest.date,
        next,
        active: now < addMonths(latest.date, step * 2),
        paymentMethod: latest.paymentMethod,
      };
    })
    .sort((a, b) => Number(b.active) - Number(a.active) || b.total - a.total);
}

/** What the active plans add up to per month (a yearly ₹12,000 counts as ₹1,000). */
export const monthlyCommitment = (plans: Plan[]) => plans.filter((p) => p.active).reduce((s, p) => s + p.amount / p.step, 0);

const ICONS: [RegExp, LucideIcon][] = [
  [/mutual|mf|sip|fund|elss|index/i, ChartPie],
  [/stock|share|equity|ipo|etf/i, ChartCandlestick],
  [/gold|silver|sgb/i, Coins],
  [/ppf|epf|vpf|provident/i, PiggyBank],
  [/nps|pension|retire/i, Landmark],
  [/\bfd\b|\brd\b|fixed|recurring|deposit/i, Vault],
  [/crypto|bitcoin|btc|eth/i, Bitcoin],
  [/bond|debenture|g-?sec|treasury/i, ScrollText],
  [/real estate|property|land|house|reit/i, House],
  [/insurance|ulip|lic/i, Building2],
  [/gem|jewel/i, Gem],
];

export function investmentIcon(type: string): LucideIcon {
  return ICONS.find(([re]) => re.test(type))?.[1] ?? TrendingUp;
}
