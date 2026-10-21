import { addDays, addMonths, daysBetween, startOfDay, startOfMonth, startOfYear } from "./dates";

export type PeriodId = "this-month" | "last-month" | "90d" | "this-year" | "all";
export type Granularity = "day" | "week" | "month";

export const PERIODS: { id: PeriodId; label: string }[] = [
  { id: "this-month", label: "This month" },
  { id: "last-month", label: "Last month" },
  { id: "90d", label: "90 days" },
  { id: "this-year", label: "This year" },
  { id: "all", label: "All time" },
];

export interface Range {
  id: PeriodId;
  /** inclusive */
  start: Date;
  /** exclusive — the full span drawn on the chart (may extend into the future) */
  end: Date;
  /** exclusive — where real data stops (today at the latest) */
  dataEnd: Date;
  /** days that have actually elapsed in the period, for averages */
  elapsedDays: number;
  /** total days in the period, for month-end projection */
  totalDays: number;
  granularity: Granularity;
  title: string;
  /** label: sentence after the delta · short: names the comparison period */
  prev: { start: Date; end: Date; label: string; short: string } | null;
  /** the whole previous period, drawn as the reference line on the pace chart */
  pace: { start: Date; end: Date; label: string } | null;
}

const monthName = new Intl.DateTimeFormat(undefined, { month: "long" });

export function getRange(id: PeriodId, now: Date, earliest: Date | null): Range {
  const today = startOfDay(now);
  const tomorrow = addDays(today, 1);
  const thisMonth = startOfMonth(now);

  const build = (
    start: Date,
    end: Date,
    granularity: Granularity,
    title: string,
    prev: Range["prev"],
    pace: Range["pace"],
    avgFrom = start,
  ): Range => {
    const dataEnd = end < tomorrow ? end : tomorrow;
    return {
      id,
      start,
      end,
      dataEnd,
      elapsedDays: Math.max(1, daysBetween(avgFrom, dataEnd)),
      totalDays: daysBetween(start, end),
      granularity,
      title,
      prev,
      pace,
    };
  };

  switch (id) {
    case "this-month": {
      const elapsed = daysBetween(thisMonth, tomorrow);
      const prevStart = addMonths(thisMonth, -1);
      const prevEnd = addDays(prevStart, elapsed);
      return build(thisMonth, addMonths(thisMonth, 1), "day", `Spent in ${monthName.format(now)}`, {
        start: prevStart,
        end: prevEnd < thisMonth ? prevEnd : thisMonth,
        label: `vs same days in ${monthName.format(prevStart)}`,
        short: `${monthName.format(prevStart)} 1–${Math.min(elapsed, daysBetween(prevStart, thisMonth))}`,
      }, { start: prevStart, end: thisMonth, label: monthName.format(prevStart) });
    }
    case "last-month": {
      const start = addMonths(thisMonth, -1);
      const prevStart = addMonths(thisMonth, -2);
      return build(start, thisMonth, "day", `Spent in ${monthName.format(start)}`, {
        start: prevStart,
        end: start,
        label: `vs ${monthName.format(prevStart)}`,
        short: `All of ${monthName.format(prevStart)}`,
      }, { start: prevStart, end: start, label: monthName.format(prevStart) });
    }
    case "90d": {
      const start = addDays(today, -89);
      return build(start, tomorrow, "week", "Spent in the last 90 days", {
        start: addDays(start, -90),
        end: start,
        label: "vs previous 90 days",
        short: "Previous 90 days",
      }, { start: addDays(start, -90), end: start, label: "Previous 90 days" });
    }
    case "this-year": {
      const start = startOfYear(now);
      const prevStart = new Date(start.getFullYear() - 1, 0, 1);
      return build(start, new Date(start.getFullYear() + 1, 0, 1), "month", `Spent in ${start.getFullYear()}`, {
        start: prevStart,
        end: addDays(prevStart, daysBetween(start, tomorrow)),
        label: `vs same period in ${prevStart.getFullYear()}`,
        short: `Same period ${prevStart.getFullYear()}`,
      }, { start: prevStart, end: start, label: String(prevStart.getFullYear()) });
    }
    case "all": {
      const first = earliest ? startOfDay(earliest) : thisMonth;
      return build(startOfMonth(first), addMonths(thisMonth, 1), "month", "Spent all time", null, null, first);
    }
  }
}
