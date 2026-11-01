"use client";

import {
  ArrowRight,
  CalendarClock,
  CalendarHeart,
  Pencil,
  UserRound,
  CircleAlert,
  CircleCheck,
  Flame,
  Lightbulb,
  PieChart,
  ReceiptText,
  Repeat,
  TrendingDown,
  TrendingUp,
  Trophy,
  Wallet,
} from "lucide-react";
import Link from "next/link";
import { useMemo, useState } from "react";
import { ColumnChart } from "@/components/charts/column-chart";
import { Donut, type DonutSegment } from "@/components/charts/donut";
import { PaceChart } from "@/components/charts/pace-chart";
import { RadialProgress } from "@/components/charts/small";
import { CategoryAvatar } from "@/components/category-avatar";
import { useDashboard } from "@/components/data-provider";
import { PageHeader } from "@/components/page-header";
import { SERIES_COLORS, slotColor, usePeriodData } from "@/components/use-period-data";
import { Amount, Badge, Card, Delta, EmptyState, Segmented, Skeleton, StatGrid, StatTile, ToneIcon, cx } from "@/components/kit";
import { MAX_SERIES, byCategory, cumulativeByDay, emiDueInRange, emiProgress, inRange, sum } from "@/lib/analytics";
import { expenseTitle } from "@/lib/api";
import { tillPayday, upcomingPayments, type Upcoming } from "@/lib/cashflow";
import { addDays, addMonths, daysBetween, isSameDay, startOfDay, startOfMonth } from "@/lib/dates";
import { fmtDay, fmtMonthShort, fmtShortDate, fmtTime } from "@/lib/format";
import { daysToPayday, firstName, greeting } from "@/lib/profile";
import { Button } from "@/components/ui/button";
import { buildInsights, type InsightKind } from "@/lib/insights";
import type { Range } from "@/lib/periods";

export function OverviewView() {
  const { data } = useDashboard();
  const pd = usePeriodData();

  return (
    <>
      <PageHeader
        title={<GreetingTitle />}
        titleClassName="text-[26px] leading-[1.2] tracking-[-0.015em] sm:text-[34px] lg:text-[37px]"
        extra={<GreetingChips />}
      />
      {!data || !pd ? (
        <OverviewSkeleton />
      ) : (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-12 lg:gap-5">
          <Hero className="lg:col-span-8" />
          <BudgetCard className="lg:col-span-4" />
          <Kpis />
          <SpendingOverTime className="lg:col-span-8" />
          <WhereItWent className="lg:col-span-4" />
          <Insights className="lg:col-span-4" />
          <Recent className="lg:col-span-4" />
          <ComingUp className="lg:col-span-4" />
        </div>
      )}
    </>
  );
}

// ─── Greeting ─────────────────────────────────────────────────

function GreetingTitle() {
  const { data, profile, now, setProfileOpen } = useDashboard();
  if (!data) return <Skeleton className="h-9 w-64 rounded-lg sm:h-10 sm:w-80" />;
  if (!profile) {
    return (
      <span className="flex flex-wrap items-center gap-3">
        <span>{greeting(now)}</span>
        <Button size="sm" className="rounded-full" onClick={() => setProfileOpen(true)}>
          <UserRound /> Add your name
        </Button>
      </span>
    );
  }
  // One run of inline text, so on narrow screens the edit button stays right after the name when the line wraps.
  return (
    <span className="group">
      {greeting(now)}, <span className="whitespace-nowrap">{firstName(profile.name)}</span>
      <Button
        variant="ghost"
        size="icon"
        className="ml-1 inline-flex align-middle text-muted-foreground opacity-60 transition-opacity group-hover:opacity-100"
        onClick={() => setProfileOpen(true)}
        aria-label="Edit profile"
        title="Edit profile"
      >
        <Pencil />
      </Button>
    </span>
  );
}

/** Small personal facts from the optional profile fields. */
function GreetingChips() {
  const { data, profile, now, fmt } = useDashboard();
  if (!data || !profile || (!profile.payday && !profile.monthlyIncome)) return null;

  const monthStart = startOfMonth(now);
  const nextMonth = addMonths(monthStart, 1);
  const spent = sum(inRange(data.expenses, monthStart, nextMonth)) + emiDueInRange(data.emis, monthStart, nextMonth).amount;
  const days = profile.payday ? daysToPayday(profile.payday, now) : null;

  return (
    <div className="mt-3 flex flex-wrap gap-2">
      {days !== null && (
        <Badge tone="brand">
          <CalendarHeart className="size-3.5" />
          {days === 0 ? "Payday is today" : days === 1 ? "Payday tomorrow" : `Payday in ${days} days`}
        </Badge>
      )}
      {profile.monthlyIncome ? (
        <Badge tone={fmt.hidden ? "neutral" : spent > profile.monthlyIncome ? "bad" : spent > profile.monthlyIncome * 0.8 ? "warn" : "neutral"}>
          <Wallet className="size-3.5" />
          {fmt.hidden ? "••%" : fmt.percent(spent / profile.monthlyIncome)} of income used this month, incl. EMIs
        </Badge>
      ) : null}
    </div>
  );
}

// ─── Hero ─────────────────────────────────────────────────────

function paceAxis(range: Range, days: number) {
  const date = (i: number) => addDays(range.start, i);
  const byMonth = range.granularity === "month";
  const idx = [0, Math.round((days - 1) / 3), Math.round(((days - 1) * 2) / 3), days - 1];
  return {
    ticks: idx.map((i) => ({ i, label: byMonth ? fmtMonthShort(date(i)) : fmtShortDate(date(i)) })),
    pointLabel: (i: number) => (range.granularity === "day" ? `Day ${i + 1} · ${fmtShortDate(date(i))}` : fmtDay(date(i))),
  };
}

function Hero({ className }: { className?: string }) {
  const { data, range, fmt, budget, now } = useDashboard();
  const pd = usePeriodData()!;

  const pace = useMemo(() => {
    const current = cumulativeByDay(data!.expenses, range.start, range.totalDays, range.dataEnd);
    const reference = range.pace
      ? cumulativeByDay(data!.expenses, range.pace.start, daysBetween(range.pace.start, range.pace.end), range.pace.end)
      : null;
    return { current, reference };
  }, [data, range]);
  const axis = paceAxis(range, Math.max(pace.current.length, pace.reference?.length ?? 0));

  const change = pd.prevTotal ? (pd.total - pd.prevTotal) / pd.prevTotal : null;
  // Per day from day-to-day spending: with rent in, day 2 of the month read ₹9,000 a day.
  const dailyPerDay = pd.dailyTotal / range.elapsedDays;
  const spendDays = new Set(pd.daily.map((e) => startOfDay(e.date).getTime())).size;
  const months = Math.max(1, Math.round(range.elapsedDays / 30.44));
  const currentLabel = range.title.replace(/^Spent (in |all time)/, "") || "All time";
  // ₹0 would read as "spent nothing then"; with no entries that old, there's simply nothing to compare.
  const hasEarlier = !range.prev || data!.expenses.some((e) => e.date < range.prev!.end);
  // A fact, not a projection: one early payment like rent made a month-end estimate wildly off.
  const spentToday = sum(pd.items.filter((e) => isSameDay(e.date, now)));

  return (
    <section className={cx("hero-surface overflow-hidden p-5 sm:p-7", className)}>
      <div>
        <div className="flex items-center justify-between gap-3">
          <p className="text-[14px] font-medium text-white/80">{range.title}</p>
          <span className="inline-flex items-center gap-1.5 rounded-full bg-white/15 px-2.5 py-1 text-[11px] font-semibold text-white">
            <Wallet size={13} aria-hidden /> {pd.items.length} expenses
          </span>
        </div>
        <p className="mt-2 text-[44px] leading-none font-semibold tracking-tight text-white sm:text-[58px]"><Amount text={fmt.money(pd.total)} /></p>
        <div className="mt-3">{range.prev ? <Delta onBrand change={change} label={range.prev.label} /> : null}</div>
        {/* What the total is made of, so one rent payment doesn't hide how day-to-day spending is going */}
        {pd.fixedTotal > 0 && (
          <p className="mt-2.5 text-[13px] text-white/75">
            Rent & subscriptions <span className="font-semibold text-white"><Amount text={fmt.money(pd.fixedTotal)} /></span> · Day-to-day{" "}
            <span className="font-semibold text-white"><Amount text={fmt.money(pd.dailyTotal)} /></span>
          </p>
        )}

        <dl className="mt-5 grid grid-cols-3 gap-3 border-t border-white/15 pt-5">
          <HeroStat
            label={range.prev?.short ?? "Monthly average"}
            value={!range.prev ? fmt.money(pd.total / months) : hasEarlier ? fmt.money(pd.prevTotal ?? 0) : "No data yet"}
          />
          <HeroStat label="Day-to-day, per day" value={fmt.money(dailyPerDay)} />
          {range.id === "this-month" ? (
            <HeroStat label="Spent today" value={spentToday ? fmt.money(spentToday) : "Nothing yet"} />
          ) : (
            <HeroStat label="Days with spending" value={`${spendDays} of ${range.elapsedDays}`} />
          )}
        </dl>

        <div className="mt-5">
          <PaceChart
            onBrand
            current={pace.current}
            reference={pace.reference}
            currentLabel={currentLabel}
            referenceLabel={range.pace?.label}
            budget={range.granularity === "day" && range.totalDays <= 31 ? budget : null}
            pointLabel={axis.pointLabel}
            ticks={axis.ticks}
            fmt={fmt}
            height={150}
          />
        </div>
      </div>
    </section>
  );
}

function HeroStat({ label, value }: { label: string; value: string }) {
  return (
    // A label may wrap to two lines on a phone; the values still line up along the bottom.
    <div className="flex min-w-0 flex-col justify-between">
      <dt className="text-[11px] leading-snug text-balance text-white/70 sm:text-[12px]">{label}</dt>
      <dd className="mt-1 truncate text-[14px] font-semibold text-white sm:text-[16px]">
        <Amount text={value} />
      </dd>
    </div>
  );
}

// ─── Budget ───────────────────────────────────────────────────

function BudgetCard({ className }: { className?: string }) {
  const { data, fmt, now, budget, setProfileOpen } = useDashboard();
  const monthStart = startOfMonth(now);
  const spent = sum(inRange(data!.expenses, monthStart, addDays(startOfDay(now), 1)));
  const daysInMonth = daysBetween(monthStart, addMonths(monthStart, 1));
  const daysLeft = daysInMonth - now.getDate() + 1;
  const monthName = new Intl.DateTimeFormat(undefined, { month: "long" }).format(now);

  if (!budget) {
    return (
      <Card className={cx("flex flex-col", className)} title={`${monthName} so far`}>
        <p className="text-[34px] font-semibold tracking-tight text-ink">
          <Amount text={fmt.money(spent)} />
        </p>
        <p className="mt-1 text-[13px] text-ink-2">Add a monthly budget to your profile to track it here.</p>
        <Button variant="outline" size="lg" className="mt-4 w-fit" onClick={() => setProfileOpen(true)}>
          Set a budget
        </Button>
      </Card>
    );
  }

  const used = spent / budget;
  // What's actually used, never a month-end guess (rent on the 1st made that guess say "At risk" on day 2).
  const state = spent > budget ? "over" : used >= 0.9 ? "near" : "ok";
  const color = state === "over" ? "var(--bad)" : state === "near" ? "var(--warn)" : "var(--brand)";
  const perDay = Math.max(0, budget - spent) / Math.max(1, daysLeft);

  return (
    <Card
      className={cx("flex flex-col", className)}
      title={`${monthName} budget`}
      subtitle={`${daysLeft} ${daysLeft === 1 ? "day" : "days"} left · EMIs not counted`}
      action={
        state === "ok" ? (
          <Badge tone="good">
            <CircleCheck size={12} /> Within budget
          </Badge>
        ) : state === "near" ? (
          <Badge tone="warn">
            <CircleAlert size={12} /> Almost used
          </Badge>
        ) : (
          <Badge tone="bad">
            <CircleAlert size={12} /> Over budget
          </Badge>
        )
      }
    >
      <div className="flex flex-1 flex-col items-center justify-center gap-5">
        <RadialProgress value={spent} max={budget} color={color}>
          <p className="text-[34px] leading-none font-semibold tracking-tight text-foreground">{Math.round(used * 100)}%</p>
          <p className="mt-1.5 text-[12px] text-muted-foreground">of {fmt.moneyCompact(budget)} used</p>
        </RadialProgress>
        <dl className="grid w-full grid-cols-3 divide-x divide-line border-t border-line pt-5 text-center">
          <MiniStat label="Spent" value={fmt.moneyCompact(spent)} />
          <MiniStat label={spent > budget ? "Over by" : "Left"} value={fmt.moneyCompact(Math.abs(budget - spent))} />
          <MiniStat label="Can spend per day" value={fmt.moneyCompact(perDay)} />
        </dl>
      </div>
    </Card>
  );
}

function MiniStat({ label, value }: { label: string; value: string }) {
  return (
    // A label may wrap to two lines; the values still line up along the bottom.
    <div className="flex min-w-0 flex-col justify-between px-2">
      <dt className="text-[12px] leading-snug text-balance text-ink-2">{label}</dt>
      <dd className="mt-1 truncate text-[15px] font-semibold text-ink">{value}</dd>
    </div>
  );
}

// ─── KPI tiles ────────────────────────────────────────────────

function Kpis() {
  const { data, range, fmt, now, profile } = useDashboard();
  const pd = usePeriodData()!;
  const emiDue = emiDueInRange(data!.emis, range.start, range.end);
  const activeEmis = data!.emis.filter((e) => emiProgress(e, range.dataEnd, data!.emiPayments).status === "active").length;
  const top = byCategory(pd.daily)[0];
  const week = upcomingPayments({ ...data!, now, until: addDays(startOfDay(now), 7) });
  const left =
    profile?.monthlyIncome && profile.payday
      ? tillPayday({ income: profile.monthlyIncome, payday: profile.payday, expenses: data!.expenses, emis: data!.emis, subscriptions: data!.subscriptions, investments: data!.investments, now })
      : null;
  const biggest = pd.daily.reduce<(typeof pd.daily)[number] | null>((m, e) => (!m || e.amount > m.amount ? e : m), null);

  return (
    <StatGrid className="lg:col-span-12">
      <StatTile
        label="Top category"
        value={top?.category ?? "—"}
        badge={top ? <Badge tone="brand">{fmt.percent(top.share)}</Badge> : undefined}
        footer={top ? `${fmt.money(top.total)} spent` : "no day-to-day spending yet"}
        sub={top ? "day-to-day only" : undefined}
      />
      {left ? (
        <StatTile
          label="Left till payday"
          value={fmt.money(left.left)}
          badge={left.left < 0 ? <Badge tone="bad">Short</Badge> : undefined}
          footer={left.left > 0 ? `${fmt.money(left.perDay)} a day for ${left.daysLeft} ${left.daysLeft === 1 ? "day" : "days"}` : `Payday in ${left.daysLeft} days`}
          sub={`${fmt.moneyCompact(left.spent + left.invested)} spent · ${fmt.moneyCompact(left.committed)} still due`}
        />
      ) : (
        <StatTile
          label="Biggest expense"
          value={biggest ? fmt.money(biggest.amount) : "—"}
          footer={biggest ? expenseTitle(biggest) : "no day-to-day spending yet"}
          sub={biggest ? fmtShortDate(biggest.date) : undefined}
        />
      )}
      <StatTile
        label="EMIs due"
        value={fmt.money(emiDue.amount)}
        badge={emiDue.count ? <Badge tone="neutral">{emiDue.count}×</Badge> : undefined}
        footer={emiDue.count ? `${emiDue.count} ${emiDue.count === 1 ? "instalment" : "instalments"}` : "nothing due"}
        sub={`${activeEmis} active ${activeEmis === 1 ? "EMI" : "EMIs"}`}
      />
      <StatTile
        label="Next 7 days"
        value={fmt.money(week.reduce((s, u) => s + u.amount, 0))}
        badge={week.length ? <Badge tone="neutral">{week.length}×</Badge> : undefined}
        footer={week[0] ? `${week[0].name} ${dueIn(week[0], now)}` : "nothing due"}
        sub="EMIs, renewals, SIPs"
      />
    </StatGrid>
  );
}

const dueIn = (u: Upcoming, now: Date) => {
  const days = daysBetween(startOfDay(now), u.date);
  return days <= 0 ? "today" : days === 1 ? "tomorrow" : `in ${days} days`;
};

// ─── Spending over time ───────────────────────────────────────

function SpendingOverTime({ className }: { className?: string }) {
  const { range, fmt, now } = useDashboard();
  const pd = usePeriodData()!;
  const [view, setView] = useState<"chart" | "table">("chart");
  const past = pd.buckets.filter((b) => !b.future);
  const avg = past.length ? past.reduce((s, b) => s + b.total, 0) / past.length : 0;
  const today = pd.buckets.findIndex((b, i) => b.start <= now && (pd.buckets[i + 1]?.start ?? new Date(8.64e15)) > now);
  const unit = range.granularity === "day" ? "Daily" : range.granularity === "week" ? "Weekly" : "Monthly";

  return (
    <Card
      className={cx("flex flex-col", className)}
      title="Spending over time"
      subtitle={`${unit} totals with the ${unit.toLowerCase()} average`}
      action={
        <Segmented
          size="sm"
          label="View"
          value={view}
          onChange={setView}
          options={[
            { value: "chart", label: "Chart" },
            { value: "table", label: "Table" },
          ]}
        />
      }
    >
      {pd.total === 0 ? (
        <EmptyState icon={<ReceiptText size={20} />} title="No spending in this period" />
      ) : view === "chart" ? (
        <ColumnChart
          ariaLabel={`${unit} spending`}
          data={pd.buckets.map((b) => ({
            value: b.total,
            tick: b.tick,
            label: b.label,
            future: b.future,
            detail: b.future ? "Upcoming" : `${b.count} ${b.count === 1 ? "transaction" : "transactions"}`,
          }))}
          highlight={today}
          average={avg}
          fmt={fmt}
        />
      ) : (
        <div className="relative min-h-60 flex-1">
          <div className="absolute inset-0 overflow-y-auto">
            <table className="w-full text-[13px]">
              <thead className="sticky top-0 bg-surface text-left text-ink-2">
                <tr className="border-b border-line">
                  <th className="py-2 font-medium">Period</th>
                  <th className="py-2 text-right font-medium">Entries</th>
                  <th className="py-2 text-right font-medium">Spent</th>
                </tr>
              </thead>
              <tbody className="tabular-nums">
                {[...past].reverse().map((b) => (
                  <tr key={b.start.getTime()} className="border-b border-line last:border-0">
                    <td className="py-2 text-ink">{b.label}</td>
                    <td className="py-2 text-right text-ink-2">{b.count}</td>
                    <td className="py-2 text-right font-medium text-ink">{fmt.money(b.total)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </Card>
  );
}

// ─── Category donut ───────────────────────────────────────────

function WhereItWent({ className }: { className?: string }) {
  const { fmt } = useDashboard();
  const pd = usePeriodData()!;

  const segments = useMemo(() => {
    const own: DonutSegment[] = [];
    let other = 0;
    for (const c of pd.categories) {
      if (pd.slots.has(c.category)) own.push({ key: c.category, label: c.category, value: c.total, color: slotColor(pd.slots, c.category) });
      else other += c.total;
    }
    // Slices follow the validated colour order so neighbouring colours stay distinguishable.
    own.sort((a, b) => (pd.slots.get(a.key) ?? 0) - (pd.slots.get(b.key) ?? 0));
    if (other > 0) own.push({ key: "__other", label: "Other", value: other, color: SERIES_COLORS[MAX_SERIES] });
    return own;
  }, [pd]);

  return (
    <Card className={className} title="Where it went" subtitle="Share of spending by category">
      {segments.length ? (
        <Donut segments={segments} fmt={fmt} centerLabel="Spent" />
      ) : (
        <EmptyState icon={<PieChart size={20} />} title="Nothing to break down yet" />
      )}
      {segments.length > 0 && (
        <Link href="/analytics" className="mt-4 inline-flex items-center gap-1 text-[13px] font-medium text-brand-ink hover:underline">
          Category details <ArrowRight size={14} aria-hidden />
        </Link>
      )}
    </Card>
  );
}

// ─── Insights ─────────────────────────────────────────────────

const INSIGHT_ICON: Record<InsightKind, typeof Lightbulb> = {
  up: TrendingUp,
  down: TrendingDown,
  weekend: CalendarClock,
  biggest: Trophy,
  budget: Wallet,
  streak: Flame,
  habit: Repeat,
  emi: CircleCheck,
};

function Insights({ className }: { className?: string }) {
  const { data, range, fmt, budget, now } = useDashboard();
  const pd = usePeriodData()!;
  const list = useMemo(
    () => buildInsights({ range, current: pd.items, previous: pd.previous, emis: data!.emis, emiPayments: data!.emiPayments, budget, fmt, now }).slice(0, 4),
    [range, pd, data, budget, fmt, now],
  );

  return (
    <Card className={className} title="Insights" subtitle="What stands out this period">
      {list.length === 0 ? (
        <EmptyState icon={<Lightbulb size={20} />} title="Not enough data yet" body="Insights appear once a few expenses are logged." />
      ) : (
        <ul className="-my-3.5 divide-y divide-line">
          {list.map((ins) => {
            const Icon = INSIGHT_ICON[ins.kind];
            return (
              <li key={ins.kind} className="flex gap-3 py-3.5">
                <ToneIcon tone={ins.tone === "good" ? "good" : ins.tone === "bad" ? "bad" : "brand"}>
                  <Icon size={17} />
                </ToneIcon>
                <div className="min-w-0">
                  <p className="text-[13px] font-semibold text-ink">{ins.title}</p>
                  <p className="mt-1 text-[12px] leading-snug text-ink-2">{ins.body}</p>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </Card>
  );
}

// ─── Recent transactions ──────────────────────────────────────

function Recent({ className }: { className?: string }) {
  const { data, fmt, now, freshIds } = useDashboard();
  const pd = usePeriodData()!;
  const recent = data!.expenses.slice(0, 6);

  return (
    <Card
      className={className}
      title="Recent"
      subtitle="Latest expenses from your Shortcut"
      action={
        <Link href="/transactions" className="inline-flex items-center gap-1 text-[13px] font-medium text-brand-ink hover:underline">
          All <ArrowRight size={14} aria-hidden />
        </Link>
      }
    >
      {recent.length === 0 ? (
        <EmptyState icon={<ReceiptText size={20} />} title="No expenses yet" />
      ) : (
        <ul className="-mx-2 space-y-0.5">
          {recent.map((e) => {
            const when = isSameDay(e.date, now) ? `Today, ${fmtTime(e.date)}` : isSameDay(e.date, addDays(now, -1)) ? `Yesterday, ${fmtTime(e.date)}` : fmtShortDate(e.date);
            return (
              <li key={e.id} className={cx("flex items-center gap-3 rounded-lg px-2 py-2", freshIds.has(e.id) && "animate-flash")}>
                <CategoryAvatar category={e.category} slots={pd.slots} />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[14px] font-medium text-ink">{expenseTitle(e)}</p>
                  <p className="mt-0.5 truncate text-[12px] text-ink-2">
                    {e.category} · {when}
                  </p>
                </div>
                <span className="shrink-0 text-[14px] font-semibold tabular-nums text-ink">{fmt.moneyExact(e.amount)}</span>
              </li>
            );
          })}
        </ul>
      )}
    </Card>
  );
}

// ─── Coming up ────────────────────────────────────────────────

const KIND: Record<Upcoming["kind"], string> = { emi: "EMI", subscription: "Subscription", investment: "Investment" };

/** One list of what's due soon: EMI instalments, subscription renewals and SIPs. */
function ComingUp({ className }: { className?: string }) {
  const { data, fmt, now } = useDashboard();
  const items = useMemo(() => upcomingPayments({ ...data!, now, until: addDays(startOfDay(now), 30) }), [data, now]);
  const total = items.reduce((s, u) => s + u.amount, 0);

  return (
    <Card className={className} title="Coming up" subtitle={items.length ? `Next 30 days · ${fmt.money(total)}` : "Next 30 days"}>
      {items.length === 0 ? (
        <EmptyState icon={<CalendarClock size={20} />} title="Nothing due in the next 30 days" body="EMIs, subscription renewals and SIPs show up here." />
      ) : (
        <ul className="-my-3.5 divide-y divide-line">
          {items.slice(0, 5).map((u) => (
            <li key={`${u.kind}${u.name}${u.date.getTime()}`} className="flex items-center gap-3 py-3.5">
              <div className="grid w-11 shrink-0 place-items-center rounded-lg bg-surface-2 py-1 text-center leading-tight">
                <span className="text-[11px] font-semibold text-brand-ink uppercase">{fmtMonthShort(u.date)}</span>
                <span className="text-[16px] font-semibold text-ink">{u.date.getDate()}</span>
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate text-[14px] font-medium text-ink">{u.name}</p>
                <p className="mt-0.5 truncate text-[12px] text-ink-2">
                  {u.kind === "emi" ? u.detail : KIND[u.kind]} · {dueIn(u, now)}
                </p>
              </div>
              <span className="shrink-0 text-[14px] font-semibold tabular-nums text-ink">{fmt.money(u.amount)}</span>
            </li>
          ))}
        </ul>
      )}
      {items.length > 5 && <p className="mt-5 text-[12px] text-ink-2">and {items.length - 5} more</p>}
    </Card>
  );
}

function OverviewSkeleton() {
  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-12 lg:gap-5">
      <Skeleton className="h-105 lg:col-span-8" />
      <Skeleton className="h-105 lg:col-span-4" />
      <Skeleton className="h-60 lg:col-span-12 lg:h-32" />
      <Skeleton className="h-85 lg:col-span-8" />
      <Skeleton className="h-85 lg:col-span-4" />
    </div>
  );
}
