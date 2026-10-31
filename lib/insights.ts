import { compareCategories, emiProgress, sum, topRemarks, weekdayAverages } from "./analytics";
import { expenseTitle } from "./api";
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

/** Plain-language observations about the selected period, strongest first. */
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

  // Category movers
  if (range.prev && previous.length) {
    const changes = compareCategories(current, previous).filter((c) => c.change !== null && Math.abs(c.total - c.prevTotal) >= 500);
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

  // Budget pace (current month only)
  if (budget && range.id === "this-month") {
    const daysLeft = range.totalDays - range.elapsedDays;
    const projected = (total / range.elapsedDays) * range.totalDays;
    if (total > budget) {
      out.push({
        kind: "budget",
        tone: "bad",
        title: "Over budget",
        body: `${fmt.money(total - budget)} past your ${fmt.money(budget)} budget with ${daysLeft} days to go.`,
        weight: 95,
      });
    } else if (projected > budget * 1.02) {
      out.push({
        kind: "budget",
        tone: "bad",
        title: `On pace to overshoot by ${fmt.money(projected - budget)}`,
        body: `Keep to ${fmt.money((budget - total) / Math.max(1, daysLeft))}/day to finish on budget.`,
        weight: 90,
      });
    } else {
      out.push({
        kind: "budget",
        tone: "good",
        title: "On track with your budget",
        body: `${fmt.money(budget - total)} left, about ${fmt.money((budget - total) / Math.max(1, daysLeft))} a day.`,
        weight: 60,
      });
    }
  }

  // Weekend vs weekday
  const wd = weekdayAverages(current, range.start, range.dataEnd);
  const weekday = wd.slice(0, 5);
  const weekend = wd.slice(5);
  const avgOf = (rows: typeof wd) => {
    const days = rows.reduce((s, r) => s + r.days, 0);
    return days ? rows.reduce((s, r) => s + r.total, 0) / days : 0;
  };
  const wkd = avgOf(weekday);
  const wke = avgOf(weekend);
  if (wkd > 0 && wke > 0 && range.elapsedDays >= 7) {
    const ratio = wke / wkd;
    if (ratio >= 1.25 || ratio <= 0.8)
      out.push({
        kind: "weekend",
        tone: "neutral",
        title: ratio >= 1 ? `Weekends cost ${ratio.toFixed(1)}× more` : "Weekdays cost more than weekends",
        body: `${fmt.money(wke)} a day on weekends vs ${fmt.money(wkd)} on weekdays.`,
        weight: 50,
      });
  }

  // Biggest single expense
  const biggest = current.reduce<Expense | null>((m, e) => (!m || e.amount > m.amount ? e : m), null);
  if (biggest && total > 0)
    out.push({
      kind: "biggest",
      tone: "neutral",
      title: `Biggest: ${fmt.money(biggest.amount)}`,
      body: `${expenseTitle(biggest)} on ${fmtShortDate(biggest.date)}, ${Math.round((biggest.amount / total) * 100)}% of the period.`,
      weight: 40,
    });

  // No-spend days
  const spendDays = new Set(current.map((e) => startOfDay(e.date).getTime())).size;
  const noSpend = range.elapsedDays - spendDays;
  if (range.elapsedDays >= 7 && noSpend >= 2)
    out.push({
      kind: "streak",
      tone: "good",
      title: `${noSpend} no-spend days`,
      body: `Out of ${range.elapsedDays} days in this period.`,
      weight: 30,
    });

  // Habit
  const habit = topRemarks(current, 1)[0];
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
