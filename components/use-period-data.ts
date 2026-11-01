"use client";

import { useMemo } from "react";
import { MAX_SERIES, bucketize, byCategory, categorySlots, inRange, sum } from "@/lib/analytics";
import { dayToDay } from "@/lib/cashflow";
import { useDashboard } from "./data-provider";

export const SERIES_COLORS = [...Array.from({ length: MAX_SERIES }, (_, i) => `var(--series-${i + 1})`), "var(--series-other)"];

/** Colour for a category: its fixed slot, or the shared "Other" grey. */
export const slotColor = (slots: Map<string, number>, category: string) => SERIES_COLORS[slots.get(category) ?? MAX_SERIES];

/** Everything derived from the selected period, computed once per data/period change. */
export function usePeriodData() {
  const { data, range, now } = useDashboard();
  return useMemo(() => {
    if (!data) return null;
    const current = inRange(data.expenses, range.start, range.dataEnd);
    const previous = range.prev ? inRange(data.expenses, range.prev.start, range.prev.end) : [];
    const slots = categorySlots(data.expenses);
    const daily = dayToDay(current);
    const total = sum(current);
    return {
      items: current,
      previous,
      total,
      prevTotal: range.prev ? sum(previous) : null,
      /** day-to-day spending: everything but rent and subscriptions (see lib/cashflow.ts) */
      daily,
      dailyTotal: sum(daily),
      fixedTotal: total - sum(daily),
      prevDailyTotal: range.prev ? sum(dayToDay(previous)) : null,
      categories: byCategory(current),
      buckets: bucketize(current, range, now),
      slots,
    };
  }, [data, range, now]);
}
