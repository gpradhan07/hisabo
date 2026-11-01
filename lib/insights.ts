import { compareCategories, emiProgress, sum, topRemarks, weekdayAverages } from "./analytics";
import { expenseTitle } from "./api";
import { dayToDay } from "./cashflow";
import { addMonths, daysBetween, startOfDay } from "./dates";
import { fmtShortDate, type Formatters } from "./format";
import type { Range } from "./periods";
import type { Emi, EmiPayment, Expense } from "./types";

export type Tone = "good" | "bad" | "neutral";
export type InsightKind = "up" | "down" | "weekend" | "biggest" | "budget" | "streak" | "habit" | "emi";

export interface Insight {
  kind: InsightKind;
  tone: Tone;
  title: string;
  body: string;
  /** higher shows first */
  weight: number;
}

/** A weekday pattern needs a few of each weekday before it means anything. */
export const PATTERN_DAYS = 21;

/**
 * Plain-language observations about the selected period, strongest first. Facts only, no projections: one early
 * rent payment made a "month-end estimate" wildly wrong. Patterns use day-to-day spending (rent and subscriptions out).
 */
export function buildInsights({
  range,
  current,
  previous,
  emis,
  emiPayments = [],
  budget,
  fmt,
  now,
}: {
  range: Range;
  current: Expense[];
  previous: Expense[];
  emis: Emi[];
  emiPayments?: EmiPayment[];
  budget: number | null;
  fmt: Formatters;
  now: Date;
}): Insight[] {
  const out: Insight[] = [];
  const total = sum(current);
  const daily = dayToDay(current);
  const dailyTotal = sum(daily);

  // Category movers (rent paid on the 1st one month and the 3rd the next isn't a change in habits)
  if (range.prev && previous.length) {
    const changes = compareCategories(daily, dayToDay(previous)).filter((c) => c.change !== null && Math.abs(c.total - c.prevTotal) >= 500);
    const up = changes.filter((c) => c.change! > 0.2).sort((a, b) => b.total - b.prevTotal - (a.total - a.prevTotal))[0];
    const down = changes.filter((c) => c.change! < -0.2).sort((a, b) => a.total - a.prevTotal - (b.total - b.prevTotal))[0];
    if (up)
      out.push({
        kind: "up",
        tone: "bad",
        title: `${up.category} is up ${Math.round(up.change! * 100)}%`,
        body: `${fmt.money(up.total)} vs ${fmt.money(up.prevTotal)} ${range.prev.label.replace(/^vs /, "in ")}.`,
        weight: 80,
      });
    if (down)
      out.push({
        kind: "down",
        tone: "good",
        title: `${down.category} is down ${Math.round(Math.abs(down.change!) * 100)}%`,
        body: `You saved ${fmt.money(down.prevTotal - down.total)} on ${down.category.toLowerCase()} compared with before.`,
        weight: 70,
      });
  }

  // Budget (current month only): what's left, not a guess at the month-end
  if (budget && range.id === "this-month") {
    const daysLeft = range.totalDays - range.elapsedDays + 1;
    const days = `${daysLeft} ${daysLeft === 1 ? "day" : "days"}`;
    if (total > budget) {
      out.push({
        kind: "budget",
        tone: "bad",
        title: "Over budget",
        body: `${fmt.money(total - budget)} past your ${fmt.money(budget)} budget, with ${days} to go.`,
        weight: 95,
      });
    } else if (total >= budget * 0.9) {
      out.push({
        kind: "budget",
        tone: "bad",
        title: `Only ${fmt.money(budget - total)} of your budget left`,
        body: `That's about ${fmt.money((budget - total) / daysLeft)} a day for the ${days} left.`,
        weight: 90,
      });
    } else {
      out.push({
        kind: "budget",
        tone: "good",
        title: `${fmt.money(budget - total)} of your budget left`,
        body: `About ${fmt.money((budget - total) / daysLeft)} a day for the ${days} left.`,
        weight: 60,
      });
    }
  }

  // Weekend vs weekday
  const wd = weekdayAverages(daily, range.start, range.dataEnd);
  const weekday = wd.slice(0, 5);
  const weekend = wd.slice(5);
  const avgOf = (rows: typeof wd) => {
    const days = rows.reduce((s, r) => s + r.days, 0);
    return days ? rows.reduce((s, r) => s + r.total, 0) / days : 0;
  };
  const wkd = avgOf(weekday);
  const wke = avgOf(weekend);
  if (wkd > 0 && wke > 0 && range.elapsedDays >= PATTERN_DAYS) {
    const ratio = wke / wkd;
    if (ratio >= 1.25 || ratio <= 0.8)
      out.push({
        kind: "weekend",
        tone: "neutral",
        title: ratio >= 1 ? `Weekends cost ${ratio.toFixed(1)}× more` : "Weekdays cost more than weekends",
        body: `${fmt.money(wke)} a day on weekends vs ${fmt.money(wkd)} on weekdays, not counting rent and subscriptions.`,
        weight: 50,
      });
  }

  // Biggest single day-to-day expense (rent would win every month, which isn't news)
  const biggest = daily.reduce<Expense | null>((m, e) => (!m || e.amount > m.amount ? e : m), null);
  if (biggest && dailyTotal > 0)
    out.push({
      kind: "biggest",
      tone: "neutral",
      title: `Biggest: ${fmt.money(biggest.amount)}`,
      body: `${expenseTitle(biggest)} on ${fmtShortDate(biggest.date)}, ${Math.round((biggest.amount / dailyTotal) * 100)}% of your day-to-day spending.`,
      weight: 40,
    });

  // No-spend days (paying rent doesn't spoil one)
  const spendDays = new Set(daily.map((e) => startOfDay(e.date).getTime())).size;
  const noSpend = range.elapsedDays - spendDays;
  if (range.elapsedDays >= 7 && noSpend >= 2)
    out.push({
      kind: "streak",
      tone: "good",
      title: `${noSpend} no-spend days`,
      body: `Out of ${range.elapsedDays} days in this period, not counting rent and subscriptions.`,
      weight: 30,
    });

  // Habit
  const habit = topRemarks(daily, 1)[0];
  if (habit && habit.count >= 3)
    out.push({
      kind: "habit",
      tone: "neutral",
      title: `${habit.name}: ${habit.count} times`,
      body: `${fmt.money(habit.total)} in total, about ${fmt.money(habit.total / habit.count)} each time.`,
      weight: 35,
    });

  // EMI ending soon
  const ending = emis
    .map((e) => emiProgress(e, now, emiPayments))
    .filter((p) => p.status === "active" && p.remainingMonths <= 3)
    .sort((a, b) => a.remainingMonths - b.remainingMonths)[0];
  if (ending?.endDate) {
    const months = Math.max(1, Math.round(daysBetween(now, addMonths(ending.endDate, 0)) / 30.44));
    out.push({
      kind: "emi",
      tone: "good",
      title: `${ending.emi.name} ends ${months <= 1 ? "next month" : `in ${months} months`}`,
      body: `That frees up ${fmt.money(ending.emi.monthly)} every month.`,
      weight: 45,
    });
  }

  return out.sort((a, b) => b.weight - a.weight);
}
