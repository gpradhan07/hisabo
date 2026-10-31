"use client";

import { CalendarClock, CirclePause, Plus, Repeat, TrendingUp } from "lucide-react";
import { createElement, useMemo, useState } from "react";
import { Donut, type DonutSegment } from "@/components/charts/donut";
import { StackedColumns } from "@/components/charts/stacked-columns";
import { useDashboard } from "@/components/data-provider";
import { Badge, Card, EmptyState, Skeleton, StatGrid, StatTile, ToneIcon, TrendBadge } from "@/components/kit";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { SERIES_COLORS, slotColor } from "@/components/use-period-data";
import { MAX_SERIES, byCategory, categorySlots, monthlyStacks } from "@/lib/analytics";
import { addDays, addMonths, startOfMonth } from "@/lib/dates";
import { fmtMonth, fmtMonthShort, fmtShortDate, type Formatters } from "@/lib/format";
import { asSeries, investmentIcon, investmentPlans, investmentTitle, monthlyCommitment, type Plan } from "@/lib/investments";
import { per } from "@/lib/recurring";
import type { Investment } from "@/lib/types";

const SUBTITLE = "Everything you've put away, as of today";

export function InvestmentsView() {
  const { data, fmt, now, profile, setInvestOpen } = useDashboard();
  const list = useMemo(() => data?.investments ?? [], [data]);
  const series = useMemo(() => asSeries(list), [list]);
  const slots = useMemo(() => categorySlots(series), [series]);
  const plans = useMemo(() => investmentPlans(list, now), [list, now]);

  if (!data) {
    return (
      <>
        <PageHeader title="Investments" subtitle={SUBTITLE} withPeriod={false} />
        <Skeleton className="h-130" />
      </>
    );
  }

  if (!list.length) {
    return (
      <>
        <PageHeader title="Investments" subtitle={SUBTITLE} withPeriod={false} />
        <Card>
          <EmptyState
            icon={<TrendingUp size={20} />}
            title="No investments yet"
            body="Add one here, or from your iPhone Shortcut with Type set to Investment."
          />
          <div className="flex justify-center pb-2">
            <Button size="lg" className="inline-grid grid-cols-[1fr_auto_1fr] gap-0 font-semibold" onClick={() => setInvestOpen(true)}>
              <Plus strokeWidth={2.5} className="mr-1.25 justify-self-end" aria-hidden />
              <span>Add investment</span>
            </Button>
          </div>
        </Card>
      </>
    );
  }

  const monthStart = startOfMonth(now);
  const lastStart = addMonths(monthStart, -1);
  const total = list.reduce((s, i) => s + i.amount, 0);
  const thisMonth = list.filter((i) => i.date >= monthStart).reduce((s, i) => s + i.amount, 0);
  // Compare with the same days of last month (1st → today's date), not the whole month.
  const sameDayLast = new Date(Math.min(monthStart.getTime(), addDays(lastStart, now.getDate()).getTime()));
  const lastToDate = list.filter((i) => i.date >= lastStart && i.date < sameDayLast).reduce((s, i) => s + i.amount, 0);
  const first = list.at(-1)!.date;
  const active = plans.filter((p) => p.active);
  const income = profile?.monthlyIncome;
  // Average over the last 12 months (or since the first investment, if that's more recent)
  const months = Math.min(12, (now.getFullYear() - first.getFullYear()) * 12 + now.getMonth() - first.getMonth() + 1);
  const yearAgo = addMonths(monthStart, -(months - 1));
  const average = list.filter((i) => i.date >= yearAgo).reduce((s, i) => s + i.amount, 0) / months;

  return (
    <>
      <PageHeader title="Investments" subtitle={SUBTITLE} withPeriod={false} />
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-12 lg:gap-5">
        <StatGrid className="lg:col-span-12">
          <StatTile label="Total invested" value={fmt.money(total)} sub={`${list.length} ${list.length === 1 ? "entry" : "entries"} since ${fmtMonth(first)}`} />
          <StatTile
            label="This month"
            value={fmt.money(thisMonth)}
            badge={lastToDate > 0 ? <TrendBadge change={(thisMonth - lastToDate) / lastToDate} upIsGood /> : undefined}
            sub={`${fmt.money(lastToDate)} by ${fmtShortDate(addDays(sameDayLast, -1))}`}
          />
          <StatTile
            label="Committed monthly"
            value={fmt.money(monthlyCommitment(plans))}
            sub={`${active.length} active ${active.length === 1 ? "plan" : "plans"}`}
          />
          {income ? (
            <StatTile label="Of your income" value={fmt.percent(thisMonth / income)} sub="invested this month" />
          ) : (
            <StatTile label="Monthly average" value={fmt.money(average)} sub={months === 12 ? "last 12 months" : `last ${months} ${months === 1 ? "month" : "months"}`} />
          )}
        </StatGrid>

        <PerMonth series={series} slots={slots} className="lg:col-span-8" />
        <Allocation series={series} slots={slots} className="lg:col-span-4" />
        {plans.length > 0 && <Plans plans={plans} fmt={fmt} className="lg:col-span-12" />}
        <Recent list={list} className="lg:col-span-12" />
      </div>
    </>
  );
}

function PerMonth({ series, slots, className }: { series: ReturnType<typeof asSeries>; slots: Map<string, number>; className?: string }) {
  const { fmt, now } = useDashboard();
  const months = useMemo(() => monthlyStacks(series, slots, 12, now), [series, slots, now]);
  const names = useMemo(() => {
    const n = new Array<string>(MAX_SERIES + 1).fill("");
    for (const [type, slot] of slots) n[slot] = type;
    n[MAX_SERIES] = "Other";
    return n;
  }, [slots]);
  const total = months.reduce((s, m) => s + m.total, 0);

  return (
    <Card className={className} title="Invested per month" subtitle={`Last 12 months · ${fmt.money(total)} in total`}>
      <StackedColumns months={months} names={names} colors={SERIES_COLORS} fmt={fmt} highlight={months.length - 1} />
    </Card>
  );
}

function Allocation({ series, slots, className }: { series: ReturnType<typeof asSeries>; slots: Map<string, number>; className?: string }) {
  const { fmt } = useDashboard();
  const segments = useMemo(() => {
    const own: DonutSegment[] = [];
    let other = 0;
    for (const t of byCategory(series)) {
      if (slots.has(t.category)) own.push({ key: t.category, label: t.category, value: t.total, color: slotColor(slots, t.category) });
      else other += t.total;
    }
    own.sort((a, b) => (slots.get(a.key) ?? 0) - (slots.get(b.key) ?? 0));
    if (other > 0) own.push({ key: "__other", label: "Other", value: other, color: SERIES_COLORS[MAX_SERIES] });
    return own;
  }, [series, slots]);

  return (
    <Card className={className} title="Where it's invested" subtitle="All time, by type">
      <Donut segments={segments} fmt={fmt} centerLabel="Invested" />
    </Card>
  );
}

function Plans({ plans, fmt, className }: { plans: Plan[]; fmt: Formatters; className?: string }) {
  return (
    <Card className={className} title="Your plans" subtitle="Recurring investments like SIPs, from what you've logged">
      <ul className="-my-3 divide-y divide-line">
        {plans.map((p) => (
          <li key={p.key} className="flex gap-3 py-3.5">
            <ToneIcon tone={p.active ? "brand" : "neutral"}>{createElement(investmentIcon(p.type), { size: 18 })}</ToneIcon>
            <div className="min-w-0 flex-1 md:flex md:items-start md:gap-8">
              <div className="min-w-0 md:w-72 md:shrink-0">
                <div className="flex items-start justify-between gap-2">
                  <p className="truncate text-[14px] font-semibold text-ink">{p.name}</p>
                  {p.active ? (
                    <Badge tone="brand">
                      <Repeat size={11} /> {p.frequency}
                    </Badge>
                  ) : (
                    <Badge tone="neutral">
                      <CirclePause size={11} /> Paused
                    </Badge>
                  )}
                </div>
                <p className="mt-0.5 text-[13px] text-ink-2">
                  <span className="font-semibold text-ink">{fmt.money(p.amount)}</span> per {per(p.interval)}
                  {p.name !== p.type && <> · {p.type}</>}
                </p>
              </div>
              <dl className="mt-3 grid grid-cols-2 gap-2 text-[12px] md:mt-0 md:flex-1 md:grid-cols-4">
                <div>
                  <dt className="text-ink-3">Invested</dt>
                  <dd className="font-medium text-ink">
                    {fmt.moneyCompact(p.total)} · {p.count}×
                  </dd>
                </div>
                <div>
                  <dt className="text-ink-3">{p.active ? "Next" : "Last"}</dt>
                  <dd className="font-medium text-ink">{fmtShortDate(p.active ? p.next : p.last)}</dd>
                </div>
                <div>
                  <dt className="text-ink-3">Since</dt>
                  <dd className="font-medium text-ink">{fmtMonth(p.first)}</dd>
                </div>
                {(p.platform || p.paymentMethod) && (
                  <div>
                    <dt className="text-ink-3">{p.platform ? "Platform" : "Paid with"}</dt>
                    <dd className="truncate font-medium text-ink">{p.platform || p.paymentMethod}</dd>
                  </div>
                )}
              </dl>
            </div>
          </li>
        ))}
      </ul>
    </Card>
  );
}

function Recent({ list, className }: { list: Investment[]; className?: string }) {
  const { fmt } = useDashboard();
  const [all, setAll] = useState(false);
  const shown = all ? list : list.slice(0, 8);

  return (
    <Card className={className} title="All investments" subtitle={`${list.length} ${list.length === 1 ? "entry" : "entries"}, newest first`}>
      <ul className="divide-y divide-line">
        {shown.map((i) => (
          <li key={i.id} className="flex items-center gap-3 py-3 first:pt-0 last:pb-0">
            <div className="grid w-11 shrink-0 place-items-center rounded-lg bg-surface-2 py-1 text-center leading-tight">
              <span className="text-[11px] font-semibold text-brand-ink uppercase">{fmtMonthShort(i.date)}</span>
              <span className="text-[16px] font-semibold text-ink">{i.date.getDate()}</span>
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate text-[14px] font-medium text-ink">{investmentTitle(i)}</p>
              <p className="truncate text-[12px] text-ink-2">
                {[investmentTitle(i) !== i.type ? i.type : null, i.frequency, i.platform || null, i.paymentMethod || null, i.cardName || null].filter(Boolean).join(" · ")}
              </p>
            </div>
            <span className="shrink-0 text-[14px] font-semibold tabular-nums text-ink">{fmt.moneyExact(i.amount)}</span>
          </li>
        ))}
      </ul>
      {list.length > 8 && (
        <Button variant="outline" className="mt-4 w-full" onClick={() => setAll(!all)}>
          {all ? "Show fewer" : `Show all ${list.length}`}
        </Button>
      )}
      {!list.length && <EmptyState icon={<CalendarClock size={20} />} title="Nothing yet" />}
    </Card>
  );
}
