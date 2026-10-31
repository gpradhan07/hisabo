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
import { advance, interval, perMonth, type Interval } from "./recurring";
import type { Expense, Investment } from "./types";

/** Investments shaped like expenses (type → category), so the shared chart helpers work on them. */
export const asSeries = (list: Investment[]): Expense[] =>
  list.map((i) => ({ id: i.id, date: i.date, amount: i.amount, category: i.type, remark: i.name || i.remark }));

/** What to call an investment: its name (fund, stock, scheme), else the note, else the type. */
export const investmentTitle = (i: Investment) => i.name || i.remark || i.type;

export interface Plan {
  key: string;
  /** the investment's name (fund / scheme), else its note, else its type */
  name: string;
  type: string;
  frequency: string;
  interval: Interval;
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
  platform: string;
}

/** Recurring investments (SIPs etc.), one per type + name, biggest first. */
export function investmentPlans(list: Investment[], now: Date): Plan[] {
  const groups = new Map<string, Investment[]>();
  for (const i of list) {
    if (!interval(i.frequency)) continue;
    const key = `${i.type}|${(i.name || i.remark).toLowerCase()}`;
    groups.set(key, [...(groups.get(key) ?? []), i]);
  }
  return [...groups.entries()]
    .map(([key, items]) => {
      const sorted = [...items].sort((a, b) => b.date.getTime() - a.date.getTime());
      const latest = sorted[0];
      const iv = interval(latest.frequency)!;
      const next = advance(latest.date, iv);
      return {
        key,
        name: investmentTitle(latest),
        type: latest.type,
        frequency: latest.frequency,
        interval: iv,
        amount: latest.amount,
        total: items.reduce((s, i) => s + i.amount, 0),
        count: items.length,
        first: sorted.at(-1)!.date,
        last: latest.date,
        next,
        active: now < advance(latest.date, iv, 2),
        paymentMethod: latest.paymentMethod,
        platform: latest.platform,
      };
    })
    .sort((a, b) => Number(b.active) - Number(a.active) || b.total - a.total);
}

/** What the active plans add up to per month (a yearly ₹12,000 counts as ₹1,000). */
export const monthlyCommitment = (plans: Plan[]) => plans.filter((p) => p.active).reduce((s, p) => s + perMonth(p.amount, p.interval), 0);

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
