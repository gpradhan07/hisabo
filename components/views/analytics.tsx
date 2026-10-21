"use client";

import { ArrowDownRight, ArrowUpRight, CalendarDays, Clock, MapPin, PieChart } from "lucide-react";
import { useMemo } from "react";
import { CategoryAvatar } from "@/components/category-avatar";
import { ColumnChart } from "@/components/charts/column-chart";
import { CalendarHeatmap } from "@/components/charts/heatmap";
import { StackedColumns } from "@/components/charts/stacked-columns";
import { useDashboard } from "@/components/data-provider";
import { PageHeader } from "@/components/page-header";
import { SERIES_COLORS, slotColor, usePeriodData } from "@/components/use-period-data";
import { Badge, Card, EmptyState, SectionHeading, Skeleton, cx } from "@/components/kit";
import { MAX_SERIES, byCategory, compareCategories, dailyTotals, hourlyTotals, monthlyStacks, topRemarks, weekdayAverages } from "@/lib/analytics";

export function AnalyticsView() {
  const { data } = useDashboard();
  const pd = usePeriodData();

  return (
    <>
      <PageHeader title="Analytics" />
      {!data || !pd ? (
        <div className="grid gap-4 lg:grid-cols-12 lg:gap-5">
          <Skeleton className="h-95 lg:col-span-7" />
          <Skeleton className="h-95 lg:col-span-5" />
          <Skeleton className="h-75 lg:col-span-6" />
          <Skeleton className="h-75 lg:col-span-6" />
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-12 lg:gap-5">
          <div className="lg:col-span-12">
            <SectionHeading hint="Follows the period above">This period</SectionHeading>
          </div>
          <Categories className="lg:col-span-7" />
          <TopPlaces className="lg:col-span-5" />
          <Weekdays className="lg:col-span-6" />
          <TimeOfDay className="lg:col-span-6" />

          <div className="lg:col-span-12">
            <SectionHeading hint="Fixed window, not affected by the period">Long-term trends</SectionHeading>
          </div>
          <MonthlyByCategory className="lg:col-span-12" />
          <Calendar className="lg:col-span-12" />
        </div>
      )}
    </>
  );
}

function Categories({ className }: { className?: string }) {
  const { fmt, range } = useDashboard();
  const pd = usePeriodData()!;
  const rows = useMemo(() => compareCategories(pd.items, pd.previous), [pd]);
  const max = rows[0]?.total ?? 0;

  return (
    <Card className={className} title="Categories" subtitle={range.prev ? `Share of spend and change ${range.prev.label}` : "Share of spend"}>
      {!rows.length ? (
        <EmptyState icon={<PieChart size={20} />} title="No spending in this period" />
      ) : (
        <ul className="space-y-3.5">
          {rows.map((c) => (
            <li key={c.category} className="flex items-center gap-3">
              <CategoryAvatar category={c.category} slots={pd.slots} />
              <div className="min-w-0 flex-1">
                <div className="flex items-baseline justify-between gap-3">
                  <span className="truncate text-[14px] font-medium text-ink">{c.category}</span>
                  <span className="shrink-0 text-[14px] font-semibold tabular-nums text-ink">{fmt.money(c.total)}</span>
                </div>
                <div className="mt-1.5 flex items-center gap-3">
                  <div className="h-2 flex-1 overflow-hidden rounded-full bg-surface-2">
                    <div className="h-full rounded-full" style={{ width: `${Math.max(2, (c.total / max) * 100)}%`, background: slotColor(pd.slots, c.category) }} />
                  </div>
                  <span className="w-9 shrink-0 text-right text-[12px] tabular-nums text-ink-2">{fmt.percent(c.share)}</span>
                  {range.prev && (
                    <span className="w-16 shrink-0 text-right">
                      {c.change === null ? (
                        <Badge tone="brand">New</Badge>
                      ) : (
                        <Badge tone={c.change > 0.005 ? "bad" : c.change < -0.005 ? "good" : "neutral"}>
                          {c.change > 0.005 ? <ArrowUpRight size={11} /> : c.change < -0.005 ? <ArrowDownRight size={11} /> : null}
                          {Math.round(Math.abs(c.change) * 100)}%
                        </Badge>
                      )}
                    </span>
                  )}
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

function TopPlaces({ className }: { className?: string }) {
  const { fmt } = useDashboard();
  const pd = usePeriodData()!;
  const places = useMemo(() => topRemarks(pd.items, 7), [pd]);
  const max = places[0]?.total ?? 0;

  return (
    <Card className={className} title="Top places" subtitle="Where your money goes most, by remark">
      {!places.length ? (
        <EmptyState icon={<MapPin size={20} />} title="No remarks yet" body="Add a remark in the Shortcut to see places here." />
      ) : (
        <ol className="space-y-3">
          {places.map((p, i) => (
            <li key={p.name} className="flex items-center gap-3">
              <span
                className={cx(
                  "grid size-7 shrink-0 place-items-center rounded-lg text-[12px] font-semibold",
                  i === 0 ? "bg-brand text-on-brand" : "bg-surface-2 text-ink-2",
                )}
              >
                {i + 1}
              </span>
              <div className="min-w-0 flex-1">
                <div className="flex items-baseline justify-between gap-3">
                  <span className="truncate text-[14px] font-medium text-ink">{p.name}</span>
                  <span className="shrink-0 text-[14px] font-semibold tabular-nums text-ink">{fmt.money(p.total)}</span>
                </div>
                <div className="mt-1 flex items-center gap-3">
                  <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-surface-2">
                    <div className="h-full rounded-full bg-brand" style={{ width: `${(p.total / max) * 100}%` }} />
                  </div>
                  <span className="shrink-0 text-[12px] text-ink-2">
                    {p.count}× · {p.category}
                  </span>
                </div>
              </div>
            </li>
          ))}
        </ol>
      )}
    </Card>
  );
}

function Weekdays({ className }: { className?: string }) {
  const { fmt, range, now } = useDashboard();
  const pd = usePeriodData()!;
  const rows = useMemo(() => weekdayAverages(pd.items, range.start, range.dataEnd), [pd, range]);
  const top = rows.reduce((m, r) => (r.avg > m.avg ? r : m), rows[0]);

  return (
    <Card
      className={cx("flex flex-col", className)}
      title="By day of week"
      subtitle={top.avg ? `${FULL_DAY[top.day]}s are your biggest spending days` : "Average spend per weekday"}
    >
      {pd.total === 0 ? (
        <EmptyState icon={<CalendarDays size={20} />} title="No spending in this period" />
      ) : (
        <ColumnChart
          ariaLabel="Average spending per weekday"
          height={240}
          valueName="Average"
          highlight={(now.getDay() + 6) % 7}
          data={rows.map((r) => ({
            value: r.avg,
            tick: r.day,
            label: `Average ${r.day}`,
            detail: `${fmt.money(r.total)} over ${r.days} ${r.day}s`,
          }))}
          fmt={fmt}
        />
      )}
    </Card>
  );
}

const FULL_DAY: Record<string, string> = {
  Mon: "Monday",
  Tue: "Tuesday",
  Wed: "Wednesday",
  Thu: "Thursday",
  Fri: "Friday",
  Sat: "Saturday",
  Sun: "Sunday",
};

const hourLabel = (h: number) => {
  const f = (x: number) => `${x % 12 || 12}${x < 12 || x === 24 ? "am" : "pm"}`;
  return `${f(h)}–${f(h + 1)}`;
};

function TimeOfDay({ className }: { className?: string }) {
  const { fmt, now } = useDashboard();
  const pd = usePeriodData()!;
  const rows = useMemo(() => hourlyTotals(pd.items), [pd]);
  const peak = rows.reduce((m, r) => (r.total > m.total ? r : m), rows[0]);

  return (
    <Card
      className={cx("flex flex-col", className)}
      title="By time of day"
      subtitle={peak.total ? `Most spending is logged around ${hourLabel(peak.hour).split("–")[0]}` : "When expenses are logged"}
    >
      {pd.total === 0 ? (
        <EmptyState icon={<Clock size={20} />} title="No spending in this period" />
      ) : (
        <ColumnChart
          ariaLabel="Spending by hour of day"
          height={240}
          highlight={now.getHours()}
          data={rows.map((r) => ({
            value: r.total,
            tick: r.hour % 6 === 0 ? (r.hour === 0 ? "12am" : r.hour === 12 ? "12pm" : r.hour < 12 ? `${r.hour}am` : `${r.hour - 12}pm`) : "",
            label: hourLabel(r.hour),
            detail: `${r.count} ${r.count === 1 ? "expense" : "expenses"}`,
          }))}
          fmt={fmt}
        />
      )}
    </Card>
  );
}

function MonthlyByCategory({ className }: { className?: string }) {
  const { data, fmt, now } = useDashboard();
  const pd = usePeriodData()!;
  const months = useMemo(() => monthlyStacks(data!.expenses, pd.slots, 12, now), [data, pd.slots, now]);
  const names = useMemo(() => {
    const n = new Array<string>(MAX_SERIES + 1).fill("");
    for (const [cat, slot] of pd.slots) n[slot] = cat;
    n[MAX_SERIES] = "Other";
    return n;
  }, [pd.slots]);
  // Table columns: only slots that hold a category (fewer than 5 early on), plus "Other" if it has spending.
  const columns = names
    .map((name, slot) => ({ name, slot }))
    .filter(({ name, slot }) => (slot < MAX_SERIES ? name !== "" : months.some((m) => m.parts[slot] > 0)));
  const total = months.reduce((s, m) => s + m.total, 0);
  const prev = months.at(-2)?.total ?? 0;
  const cur = months.at(-1)?.total ?? 0;

  return (
    <Card
      className={className}
      title="Monthly spending by category"
      subtitle={`Last 12 months · ${fmt.money(total)} total · ${fmt.money(total / 12)} per month on average`}
      action={
        prev > 0 ? (
          <Badge tone={cur > prev ? "bad" : "good"}>
            {cur > prev ? <ArrowUpRight size={11} /> : <ArrowDownRight size={11} />}
            {Math.round(Math.abs((cur - prev) / prev) * 100)}% vs last month
          </Badge>
        ) : null
      }
    >
      <StackedColumns months={months} names={names} colors={SERIES_COLORS} fmt={fmt} highlight={months.length - 1} />
      <details className="mt-4 border-t border-line pt-3">
        <summary className="w-fit cursor-pointer text-[13px] font-medium text-brand-ink">Show as table</summary>
        <div className="mt-2 overflow-x-auto">
          <table className="w-full min-w-120 text-[12px] tabular-nums">
            <thead className="text-ink-2">
              <tr className="border-b border-line">
                <th className="py-2 text-left font-medium">Month</th>
                {columns.map((c) => (
                  <th key={c.slot} className="py-2 text-right font-medium">
                    {c.name}
                  </th>
                ))}
                <th className="py-2 text-right font-medium">Total</th>
              </tr>
            </thead>
            <tbody>
              {[...months].reverse().map((m) => (
                <tr key={m.label} className="border-b border-line last:border-0">
                  <td className="py-1.5 text-ink">{m.label}</td>
                  {columns.map((c) => (
                    <td key={c.slot} className="py-1.5 text-right text-ink-2">
                      {m.parts[c.slot] ? fmt.moneyCompact(m.parts[c.slot]) : "—"}
                    </td>
                  ))}
                  <td className="py-1.5 text-right font-semibold text-ink">{fmt.money(m.total)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
    </Card>
  );
}

function Calendar({ className }: { className?: string }) {
  const { data, fmt, now } = useDashboard();
  const totals = useMemo(() => dailyTotals(data!.expenses), [data]);
  const yearCats = useMemo(() => byCategory(data!.expenses).length, [data]);

  return (
    <Card className={className} title="Spending calendar" subtitle={`Every day of the last year at a glance · ${yearCats} categories tracked`}>
      <CalendarHeatmap totals={totals} today={now} fmt={fmt} />
    </Card>
  );
}
