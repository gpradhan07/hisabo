"use client";

import { CalendarClock, ChevronLeft, ChevronRight, CirclePause, CirclePlay, CircleStop, LoaderCircle, Plus, Repeat, TrendingUp } from "lucide-react";
import { useRouter } from "next/navigation";
import { createElement, useMemo, useState, useTransition } from "react";
import { toast } from "sonner";
import { setInvestmentStopped } from "@/app/(dashboard)/actions";
import { Donut, type DonutSegment } from "@/components/charts/donut";
import { DeleteButton, DeleteDialog, useCanDelete, useHidden, type DeleteTarget } from "@/components/delete-dialog";
import { StackedColumns } from "@/components/charts/stacked-columns";
import { useDashboard } from "@/components/data-provider";
import { Badge, Card, EmptyState, Skeleton, StatGrid, StatTile, ToneIcon, TrendBadge, cx } from "@/components/kit";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { SERIES_COLORS, slotColor } from "@/components/use-period-data";
import { MAX_SERIES, WEEKDAYS, byCategory, categorySlots, monthlyStacks } from "@/lib/analytics";
import { addDays, addMonths, isSameDay, startOfDay, startOfMonth, startOfWeek } from "@/lib/dates";
import { fmtDate, fmtMonth, fmtMonthShort, fmtShortDate, type Formatters } from "@/lib/format";
import { asSeries, investmentIcon, investmentPlans, investmentTitle, monthlyCommitment, withAutoInstalments, type Plan } from "@/lib/investments";
import { per } from "@/lib/recurring";
import type { Investment } from "@/lib/types";

const SUBTITLE = "Money you've put in so far · not today's market value";

export function InvestmentsView() {
  const { data, fmt, now, profile, setInvestOpen } = useDashboard();
  // A SIP keeps counting every month until it's stopped, logged or not (see withAutoInstalments).
  const list = useMemo(() => withAutoInstalments(data?.investments ?? [], now), [data, now]);
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
  const autoCount = list.filter((i) => i.auto).length;
  const active = plans.filter((p) => p.active);
  const income = profile?.monthlyIncome;
  // Average over the last 12 months (or since the first investment, if that's more recent)
  const months = Math.min(12, (now.getFullYear() - first.getFullYear()) * 12 + now.getMonth() - first.getMonth() + 1);
  const yearAgo = addMonths(monthStart, -(months - 1));
  const average = list.filter((i) => i.date >= yearAgo).reduce((s, i) => s + i.amount, 0) / months;
  // Before this month's SIP dates, "₹0 invested" reads as a problem; show what's planned instead.
  const planned = active.filter((p) => p.next >= startOfDay(now) && p.next < addMonths(monthStart, 1)).sort((a, b) => a.next.getTime() - b.next.getTime());
  const plannedTotal = planned.reduce((s, p) => s + p.amount, 0);
  const showPlanned = thisMonth === 0 && plannedTotal > 0;

  return (
    <>
      <PageHeader title="Investments" subtitle={SUBTITLE} withPeriod={false} />
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-12 lg:gap-5">
        <StatGrid className="lg:col-span-12">
          <StatTile label="Money put in" value={fmt.money(total)} sub={`all time, since ${fmtMonth(first)}${autoCount ? ` · ${autoCount} auto` : ""}`} />
          {showPlanned ? (
            <StatTile label="Planned this month" value={fmt.money(plannedTotal)} sub={`next: ${planned[0].name} on ${fmtShortDate(planned[0].next)}`} />
          ) : (
            <StatTile
              label="This month"
              value={fmt.money(thisMonth)}
              badge={lastToDate > 0 ? <TrendBadge change={(thisMonth - lastToDate) / lastToDate} upIsGood /> : undefined}
              sub={`${fmt.money(lastToDate)} by ${fmtShortDate(addDays(sameDayLast, -1))} last month`}
            />
          )}
          <StatTile
            label="Your plans need"
            value={fmt.money(monthlyCommitment(plans))}
            sub={`a month, across ${active.length} active ${active.length === 1 ? "plan" : "plans"}`}
          />
          {income ? (
            <StatTile
              label="Of your income"
              value={fmt.percent((showPlanned ? plannedTotal : thisMonth) / income)}
              sub={showPlanned ? "planned this month" : "invested this month"}
            />
          ) : (
            <StatTile label="Monthly average" value={fmt.money(average)} sub={months === 12 ? "last 12 months" : `last ${months} ${months === 1 ? "month" : "months"}`} />
          )}
        </StatGrid>

        <PerMonth series={series} slots={slots} className="lg:col-span-8" />
        <Allocation series={series} slots={slots} className="lg:col-span-4" />
        {plans.length > 0 && <Plans plans={plans} fmt={fmt} className="lg:col-span-12" />}
        <InvestmentCalendar list={list} plans={plans} className="lg:col-span-12" />
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
  const { refresh } = useDashboard();
  const router = useRouter();
  const canChange = useCanDelete();
  const [pending, start] = useTransition();
  const [busy, setBusy] = useState<string | null>(null);

  // Stop: from today, saved in the sheet. Undo: clears it (to start again later, log it once more).
  const toggle = (p: Plan) => {
    setBusy(p.key);
    start(async () => {
      const latest = p.latestLogged;
      const res = await setInvestmentStopped({ id: latest.id, date: latest.date.toISOString(), amount: latest.amount }, p.active);
      setBusy(null);
      if (!res.ok) {
        if (res.code === "connect-drive") router.replace("/connect-drive");
        else toast.error(res.error);
        return;
      }
      toast.success(p.active ? `Stopped ${p.name}` : `${p.name} is running again`, {
        description: p.active ? "It isn't counted from today. The months before stay." : `It counts every ${per(p.interval)} again.`,
      });
      refresh();
    });
  };

  return (
    <Card
      className={className}
      title="Your plans"
      subtitle="A SIP counts every time it's due until you stop it. Logging an instalment yourself replaces the automatic one."
    >
      <ul className="-my-3.5 divide-y divide-line">
        {plans.map((p) => (
          <li key={p.key} className="flex gap-3 py-4">
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
                      <CirclePause size={11} /> Stopped
                    </Badge>
                  )}
                </div>
                <p className="mt-0.5 text-[13px] text-ink-2">
                  <span className="font-semibold text-ink">{fmt.money(p.amount)}</span> per {per(p.interval)}
                  {p.name !== p.type && <> · {p.type}</>}
                </p>
                {canChange && (
                  <Button variant="outline" size="sm" className="mt-2.5" onClick={() => toggle(p)} disabled={pending}>
                    {busy === p.key ? <LoaderCircle className="animate-spin" aria-hidden /> : p.active ? <CircleStop aria-hidden /> : <CirclePlay aria-hidden />}
                    {p.active ? "Stop SIP" : "Undo stop"}
                  </Button>
                )}
              </div>
              <dl className="mt-3.5 grid grid-cols-2 gap-x-2 gap-y-3 text-[12px] md:mt-0 md:flex-1 md:grid-cols-4">
                <div>
                  <dt className="text-ink-3">Invested</dt>
                  <dd className="mt-0.5 font-medium text-ink">
                    {fmt.moneyCompact(p.total)} · {p.count}×{p.autoCount > 0 && <span className="font-normal text-ink-2"> ({p.autoCount} auto)</span>}
                  </dd>
                </div>
                <div>
                  <dt className="text-ink-3">{p.active ? "Next" : "Stopped"}</dt>
                  <dd className="mt-0.5 font-medium text-ink">{fmtShortDate(p.active ? p.next : (p.stoppedOn ?? p.last))}</dd>
                </div>
                <div>
                  <dt className="text-ink-3">Since</dt>
                  <dd className="mt-0.5 font-medium text-ink">{fmtMonth(p.first)}</dd>
                </div>
                {(p.platform || p.paymentMethod) && (
                  <div>
                    <dt className="text-ink-3">{p.platform ? "Platform" : "Paid with"}</dt>
                    <dd className="mt-0.5 truncate font-medium text-ink">{p.platform || p.paymentMethod}</dd>
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

const monthTitle = new Intl.DateTimeFormat(undefined, { month: "long", year: "numeric" });
const dayKey = (d: Date) => startOfDay(d).getTime();

type Upcoming = { plan: Plan; date: Date };

/**
 * Every investment on a month calendar: solid days were logged, outlined ones hisabo counted by itself, dashed ones
 * are still to come. Tapping a day lists it beside (or below) the calendar; otherwise the list is the whole month.
 */
function InvestmentCalendar({ list: allEntries, plans, className }: { list: Investment[]; plans: Plan[]; className?: string }) {
  const { fmt, now } = useDashboard();
  const canDelete = useCanDelete();
  const hidden = useHidden();
  const [toDelete, setToDelete] = useState<DeleteTarget | null>(null);
  const [month, setMonth] = useState(() => startOfMonth(now));
  const [selected, setSelected] = useState<Date | null>(null);

  const list = allEntries.filter((i) => !hidden.ids.has(i.id));
  const earliest = list.length ? startOfMonth(list.at(-1)!.date) : startOfMonth(now);
  // One month ahead, for the next instalments
  const latest = addMonths(startOfMonth(now), 1);
  const monthEnd = addMonths(month, 1);
  const inMonth = list.filter((i) => i.date >= month && i.date < monthEnd);
  const upcoming: Upcoming[] = plans.filter((p) => p.active && p.next > now && p.next >= month && p.next < monthEnd).map((p) => ({ plan: p, date: p.next }));

  const byDay = new Map<number, { entries: Investment[]; upcoming: Upcoming[] }>();
  const at = (d: Date) => byDay.get(dayKey(d)) ?? byDay.set(dayKey(d), { entries: [], upcoming: [] }).get(dayKey(d))!;
  for (const i of inMonth) at(i.date).entries.push(i);
  for (const u of upcoming) at(u.date).upcoming.push(u);

  // Whole weeks, Monday first, from the week the month starts in to the week it ends in
  const gridStart = startOfWeek(month);
  const weeks = Math.ceil(Math.round((monthEnd.getTime() - gridStart.getTime()) / 86_400_000) / 7);
  const days = Array.from({ length: weeks * 7 }, (_, n) => addDays(gridStart, n));
  const monthTotal = inMonth.reduce((s, i) => s + i.amount, 0);

  const go = (n: number) => {
    setMonth((m) => addMonths(m, n));
    setSelected(null);
  };
  const shownEntries = (selected ? inMonth.filter((i) => isSameDay(i.date, selected)) : inMonth).sort((a, b) => b.date.getTime() - a.date.getTime());
  const shownUpcoming = selected ? upcoming.filter((u) => isSameDay(u.date, selected)) : upcoming;
  const deleteTarget = (i: Investment): DeleteTarget => ({
    question: "Delete this investment?",
    title: investmentTitle(i),
    detail: [investmentTitle(i) !== i.type ? i.type : null, i.frequency, fmtDate(i.date)].filter(Boolean).join(" · "),
    amount: i.amount,
    done: `Deleted ${fmt.moneyExact(i.amount)} · ${investmentTitle(i)}`,
    items: [{ id: i.id, date: i.date.toISOString(), amount: i.amount }],
    hide: [i.id],
  });

  return (
    <Card
      className={className}
      title="All investments"
      subtitle={`${fmt.money(monthTotal)} · ${inMonth.length} ${inMonth.length === 1 ? "instalment" : "instalments"}`}
      action={
        <div className="flex items-center gap-1">
          <Button variant="ghost" size="icon" onClick={() => go(-1)} disabled={month <= earliest} aria-label="Previous month">
            <ChevronLeft />
          </Button>
          <span className="min-w-28 text-center text-[13px] font-medium text-ink" aria-live="polite">
            {monthTitle.format(month)}
          </span>
          <Button variant="ghost" size="icon" onClick={() => go(1)} disabled={month >= latest} aria-label="Next month">
            <ChevronRight />
          </Button>
        </div>
      }
    >
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1.35fr)_minmax(0,1fr)] lg:gap-8">
        <div>
          <div className="grid grid-cols-7 gap-1 sm:gap-1.5">
            {WEEKDAYS.map((d) => (
              <div key={d} className="pb-1.5 text-center text-[11px] font-medium text-ink-3" aria-hidden>
                <span className="sm:hidden">{d[0]}</span>
                <span className="hidden sm:inline">{d}</span>
              </div>
            ))}
            {days.map((d) => {
              const inThisMonth = d >= month && d < monthEnd;
              const day = inThisMonth ? byDay.get(dayKey(d)) : undefined;
              const logged = day?.entries.filter((i) => !i.auto) ?? [];
              const auto = day?.entries.filter((i) => i.auto) ?? [];
              const due = day?.upcoming ?? [];
              const amount = [...(day?.entries ?? [])].reduce((s, i) => s + i.amount, 0) + due.reduce((s, u) => s + u.plan.amount, 0);
              const isToday = isSameDay(d, now);
              const isSelected = !!selected && isSameDay(d, selected);
              const marked = logged.length + auto.length + due.length > 0;
              const kind = logged.length ? "logged" : auto.length ? "auto" : due.length ? "due" : null;
              const names = [...(day?.entries ?? []).map((i) => investmentTitle(i)), ...due.map((u) => u.plan.name)];
              const content = (
                <>
                  <span className={cx("text-[12px] tabular-nums sm:text-[13px]", isToday ? "rounded-full bg-ink px-1.5 font-semibold text-page" : inThisMonth ? "text-ink" : "text-ink-3/50")}>
                    {d.getDate()}
                  </span>
                  {marked && (
                    <>
                      <span className="mt-auto hidden truncate text-[11px] font-semibold tabular-nums sm:block">{fmt.moneyCompact(amount)}</span>
                      <span className="mt-auto flex gap-0.5 sm:hidden" aria-hidden>
                        {Array.from({ length: Math.min(3, logged.length + auto.length + due.length) }, (_, n) => (
                          <i key={n} className="size-1.5 rounded-full bg-current" />
                        ))}
                      </span>
                    </>
                  )}
                </>
              );
              const box = cx(
                "flex aspect-square min-w-0 flex-col items-start rounded-lg border p-1 text-left sm:aspect-[5/4] sm:p-1.5",
                kind === "logged" && "border-brand/45 bg-brand-soft text-brand-ink",
                kind === "auto" && "border-brand/50 text-brand-ink",
                kind === "due" && "border-dashed border-ink-3 text-ink-2",
                !kind && "border-transparent",
                isSelected && "ring-2 ring-brand ring-offset-1 ring-offset-card",
              );
              return marked ? (
                <button
                  key={d.getTime()}
                  type="button"
                  aria-pressed={isSelected}
                  aria-label={`${fmtDate(d)}: ${fmt.money(amount)}, ${names.join(", ")}${kind === "auto" ? " (counted automatically)" : kind === "due" ? " (coming up)" : ""}`}
                  onClick={() => setSelected(isSelected ? null : d)}
                  className={cx(box, "transition-colors hover:bg-muted focus-visible:outline-2 focus-visible:outline-brand")}
                >
                  {content}
                </button>
              ) : (
                <div key={d.getTime()} className={box} aria-hidden={!inThisMonth}>
                  {content}
                </div>
              );
            })}
          </div>
          <div className="mt-4 flex flex-wrap gap-x-4 gap-y-1.5 text-[12px] text-ink-2">
            <span className="flex items-center gap-1.5">
              <i className="size-3 rounded-[4px] border border-brand/45 bg-brand-soft" aria-hidden /> Logged
            </span>
            <span className="flex items-center gap-1.5">
              <i className="size-3 rounded-[4px] border border-brand/50" aria-hidden /> Counted automatically
            </span>
            <span className="flex items-center gap-1.5">
              <i className="size-3 rounded-[4px] border border-dashed border-ink-3" aria-hidden /> Coming up
            </span>
          </div>
        </div>

        <div className="min-w-0 lg:border-l lg:border-line lg:pl-8">
          <div className="mb-2 flex items-baseline justify-between gap-3">
            <p className="text-[13px] font-medium text-ink">{selected ? fmtDate(selected) : `All of ${monthTitle.format(month)}`}</p>
            {selected && (
              <button type="button" onClick={() => setSelected(null)} className="text-[12px] font-medium text-brand-ink hover:underline">
                Whole month
              </button>
            )}
          </div>
          {!shownEntries.length && !shownUpcoming.length ? (
            <EmptyState icon={<CalendarClock size={20} />} title={`Nothing in ${monthTitle.format(month)}`} />
          ) : (
            <ul className="divide-y divide-line">
              {shownUpcoming.map(({ plan, date }) => (
                <li key={`due-${plan.key}`} className="flex items-center gap-3 py-3">
                  <DateChip date={date} />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[14px] font-medium text-ink">{plan.name}</p>
                    <p className="mt-0.5 truncate text-[12px] text-ink-2">Coming up · {plan.frequency}</p>
                  </div>
                  <span className="shrink-0 text-[14px] font-semibold tabular-nums text-ink-2">{fmt.moneyExact(plan.amount)}</span>
                  {canDelete && <span className="-mr-1 size-8 shrink-0" aria-hidden />}
                </li>
              ))}
              {shownEntries.map((i) => (
                <li key={i.id} className="flex items-center gap-3 py-3">
                  <DateChip date={i.date} />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[14px] font-medium text-ink">{investmentTitle(i)}</p>
                    <p className="mt-0.5 truncate text-[12px] text-ink-2">
                      {(i.auto
                        ? ["Counted automatically", i.frequency]
                        : [investmentTitle(i) !== i.type ? i.type : null, i.frequency, i.platform || null, i.paymentMethod || null, i.cardName || null]
                      )
                        .filter(Boolean)
                        .join(" · ")}
                    </p>
                  </div>
                  <span className="shrink-0 text-[14px] font-semibold tabular-nums text-ink">{fmt.moneyExact(i.amount)}</span>
                  {canDelete &&
                    (i.auto ? (
                      <span className="-mr-1 size-8 shrink-0" aria-hidden />
                    ) : (
                      <DeleteButton label={`Delete ${investmentTitle(i)}`} onClick={() => setToDelete(deleteTarget(i))} className="-mr-1" />
                    ))}
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
      <DeleteDialog target={toDelete} onClose={() => setToDelete(null)} onDeleted={(t) => hidden.hide(t.hide)} />
    </Card>
  );
}

function DateChip({ date }: { date: Date }) {
  return (
    <div className="grid w-11 shrink-0 place-items-center rounded-lg bg-surface-2 py-1 text-center leading-tight">
      <span className="text-[11px] font-semibold text-brand-ink uppercase">{fmtMonthShort(date)}</span>
      <span className="text-[16px] font-semibold text-ink">{date.getDate()}</span>
    </div>
  );
}
