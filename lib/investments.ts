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
  list.map((i) => ({ id: i.id, date: i.date, amount: i.amount, category: i.type, remark: investmentTitle(i) }));

/** What to call an investment: its name (fund, stock, scheme), else the note, else the type. */
export const investmentTitle = (i: Investment) => i.planName || i.name || i.remark || i.type;

const baseKey = (i: Investment) => `${i.type}|${(i.name || i.remark).trim().toLowerCase()}`;
const midpoint = (a: Date, b: Date) => new Date((a.getTime() + b.getTime()) / 2);
const MAX_INSTALMENTS = 2000;

/** The instalment window a date falls in: within half an interval of instalment k of a run starting at `start`. */
function windowOf(start: Date, iv: Interval, date: Date) {
  const due = (k: number) => advance(start, iv, k);
  let k = 0;
  while (k < MAX_INSTALMENTS && date >= midpoint(due(k), due(k + 1))) k++;
  return { from: midpoint(due(k - 1), due(k)), to: midpoint(due(k), due(k + 1)) };
}

interface Group {
  key: string;
  /** shown in the dashboard: the name, numbered when another plan already has it ("Post office 2") */
  name: string;
  entries: Investment[];
}

/**
 * Splits recurring entries into plans, oldest first. A same-name entry is an instalment of a running plan when it
 * has that plan's amount and frequency and its month isn't logged yet; after a stop it restarts the plan. Anything
 * else (a different amount, a second deposit in a logged month) is a plan of its own, numbered by hisabo.
 */
function groupPlans(list: Investment[]): Group[] {
  const recurring = list.filter((i) => !i.auto && interval(i.frequency)).sort((a, b) => a.date.getTime() - b.date.getTime());
  const byName = new Map<string, Group[]>();
  for (const e of recurring) {
    const plans = byName.get(baseKey(e)) ?? [];
    byName.set(baseKey(e), plans);
    const iv = interval(e.frequency)!;
    const last = (g: Group) => g.entries.at(-1)!;
    const stopped = (g: Group) => !!last(g).stoppedOn;
    const instalmentOf = plans.find((g) => {
      if (stopped(g) || last(g).frequency !== e.frequency || Math.abs(last(g).amount - e.amount) >= 0.5) return false;
      // The current run: since the plan last restarted after a stop
      const run = g.entries.slice(Math.max(0, g.entries.findLastIndex((_, i) => i > 0 && !!g.entries[i - 1].stoppedOn)));
      const { from, to } = windowOf(run[0].date, iv, e.date);
      return !run.some((x) => x.date >= from && x.date < to);
    });
    const restart = !instalmentOf && plans.filter(stopped).find((g) => Math.abs(last(g).amount - e.amount) < 0.5 || !plans.some((p) => !stopped(p)));
    const group = instalmentOf ?? restart;
    if (group) group.entries.push(e);
    else {
      const n = plans.length + 1;
      // The name as logged, never an earlier numbering (`planName`), so running this twice doesn't give "Post office 2 2"
      const name = e.name || e.remark || e.type;
      plans.push({ key: `${baseKey(e)}#${n}`, name: n === 1 ? name : `${name} ${n}`, entries: [e] });
    }
  }
  return [...byName.values()].flat();
}

interface Schedule {
  /** instalments nobody logged, counted at the latest logged amount before them */
  autos: Investment[];
  /** the next instalment still to come (none once stopped) */
  next: Date | null;
  stoppedOn: Date | null;
}

/**
 * One plan's instalments. A run starts at a logged entry and repeats every interval until it's stopped, the next
 * run starts (logging again after a stop), or today. A logged entry within half an interval of an instalment's date
 * stands in for it, so a month is never counted twice.
 */
function schedule(group: Group, now: Date): Schedule {
  const runs: Investment[][] = [];
  let run: Investment[] = [];
  for (const i of group.entries) {
    run.push(i);
    if (i.stoppedOn) {
      runs.push(run);
      run = [];
    }
  }
  if (run.length) runs.push(run);

  const autos: Investment[] = [];
  let next: Date | null = null;
  runs.forEach((r, n) => {
    const first = r[0];
    const iv = interval(r.at(-1)!.frequency)!;
    const stop = r.at(-1)!.stoppedOn?.getTime() ?? Infinity;
    const until = Math.min(stop, runs[n + 1]?.[0].date.getTime() ?? Infinity);
    const due = (k: number) => advance(first.date, iv, k);
    const logged = (k: number) => {
      const from = midpoint(due(k - 1), due(k));
      const to = midpoint(due(k), due(k + 1));
      return r.some((i) => i.date >= from && i.date < to);
    };
    for (let k = 1; k < MAX_INSTALMENTS; k++) {
      const at = due(k);
      if (at.getTime() >= until) break;
      if (at > now) {
        // The next one still to come, unless it's already been logged early
        if (n === runs.length - 1 && !logged(k)) {
          next = at;
          break;
        }
        continue;
      }
      if (logged(k)) continue;
      const before = r.filter((i) => i.date <= at).at(-1)!;
      autos.push({ ...before, id: `auto-${group.key}-${n}-${k}`, date: at, stoppedOn: null, auto: true, planName: group.name });
    }
  });
  return { autos, next, stoppedOn: runs.at(-1)!.at(-1)!.stoppedOn ?? null };
}

/**
 * Every investment, plus the instalments of recurring ones (SIPs, RDs…) that weren't logged: a SIP added once in
 * August keeps counting every month until it's stopped. Logging a month replaces its automatic instalment.
 * Entries carry their plan's name (`planName`), numbered when two plans share one.
 */
export function withAutoInstalments(list: Investment[], now: Date): Investment[] {
  const logged = list.filter((i) => !i.auto);
  const groups = groupPlans(logged);
  const planOf = new Map(groups.flatMap((g) => g.entries.map((e) => [e.id, g.name] as const)));
  const autos = groups.flatMap((g) => schedule(g, now).autos);
  return [...logged.map((i) => (planOf.has(i.id) ? { ...i, planName: planOf.get(i.id) } : i)), ...autos].sort((a, b) => b.date.getTime() - a.date.getTime());
}

export interface Plan {
  key: string;
  /** the investment's name (fund / scheme), else its note, else its type; numbered when two plans share one */
  name: string;
  type: string;
  frequency: string;
  interval: Interval;
  /** most recent instalment */
  amount: number;
  /** logged and automatic instalments */
  total: number;
  count: number;
  /** how many of `count` hisabo counted by itself */
  autoCount: number;
  first: Date;
  last: Date;
  /** the next instalment; the last one once stopped */
  next: Date;
  /** keeps counting until "Stop SIP" */
  active: boolean;
  stoppedOn: Date | null;
  /** the latest entry in the sheet, where a stop is saved */
  latestLogged: Investment;
  paymentMethod: string;
  platform: string;
}

/** Recurring investments (SIPs etc.), one per plan, running ones first, then biggest. */
export function investmentPlans(list: Investment[], now: Date): Plan[] {
  return groupPlans(list)
    .map((group): Plan => {
      const plan = schedule(group, now);
      const all = [...group.entries, ...plan.autos].sort((a, b) => b.date.getTime() - a.date.getTime());
      const latest = all[0];
      const latestLogged = group.entries.at(-1)!;
      return {
        key: group.key,
        name: group.name,
        type: latestLogged.type,
        frequency: latestLogged.frequency,
        interval: interval(latestLogged.frequency)!,
        amount: latest.amount,
        total: all.reduce((s, i) => s + i.amount, 0),
        count: all.length,
        autoCount: plan.autos.length,
        first: all.at(-1)!.date,
        last: latest.date,
        next: plan.next ?? latest.date,
        active: !plan.stoppedOn,
        stoppedOn: plan.stoppedOn,
        latestLogged,
        paymentMethod: latestLogged.paymentMethod,
        platform: latestLogged.platform,
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
