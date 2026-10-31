"use client";

import { CalendarClock, CircleCheck, CirclePause, Repeat } from "lucide-react";
import { useMemo, useState } from "react";
import { useDashboard } from "@/components/data-provider";
import { Badge, Card, EmptyState, Skeleton, StatGrid, StatTile, ToneIcon } from "@/components/kit";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { daysBetween } from "@/lib/dates";
import { fmtMonth, fmtMonthShort, fmtShortDate } from "@/lib/format";
import { per } from "@/lib/recurring";
import { monthlySubscriptionCost, subscriptionPlans, type SubscriptionPlan } from "@/lib/subscriptions";

const inDays = (n: number) => (n <= 0 ? "today" : n === 1 ? "tomorrow" : `in ${n} days`);

export function SubscriptionsView() {
  const { data, fmt, now } = useDashboard();
  const plans = useMemo(() => subscriptionPlans(data?.subscriptions ?? [], now), [data, now]);

  if (!data) {
    return (
      <>
        <PageHeader title="Subscriptions" withPeriod={false} />
        <Skeleton className="h-130" />
      </>
    );
  }

  const renewing = plans.filter((p) => p.status === "active");
  const current = plans.filter((p) => p.status === "active" || p.status === "ending");
  const past = plans.filter((p) => p.status === "ended" || p.status === "one-time");
  const monthly = monthlySubscriptionCost(plans);
  const soonest = renewing.find((p) => p.next);

  return (
    <>
      <PageHeader title="Subscriptions" subtitle="Next renewals worked out from what you've paid" withPeriod={false} />
      {!plans.length ? (
        <Card>
          <EmptyState
            icon={<Repeat size={20} />}
            title="No subscriptions yet"
            body="Log Netflix, Spotify, a gym and the like from your iPhone Shortcut: choose Subscriptions."
          />
        </Card>
      ) : (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-12 lg:gap-5">
          <StatGrid className="lg:col-span-12">
            <StatTile label="Per month" value={fmt.money(monthly)} sub={`${renewing.length} renewing`} />
            <StatTile label="Per year" value={fmt.money(monthly * 12)} sub="at today's prices" />
            <StatTile
              label="Next renewal"
              value={soonest?.next ? fmtShortDate(soonest.next) : "—"}
              sub={soonest?.next ? `${soonest.name} · ${inDays(daysBetween(now, soonest.next))}` : "nothing renewing"}
            />
            <StatTile label="Paid so far" value={fmt.money(plans.reduce((s, p) => s + p.total, 0))} sub="all subscriptions" />
          </StatGrid>

          <PlanList title="Current" subtitle="Renewing, or paid up until they end" plans={current} className="lg:col-span-7" />
          <History className="lg:col-span-5" />
          {past.length > 0 && <PlanList title="One-time and ended" subtitle="Nothing more to pay" plans={past} className="lg:col-span-12" />}
        </div>
      )}
    </>
  );
}

function PlanList({ title, subtitle, plans, className }: { title: string; subtitle: string; plans: SubscriptionPlan[]; className?: string }) {
  const { fmt, now } = useDashboard();
  return (
    <Card className={className} title={title} subtitle={subtitle}>
      {!plans.length ? (
        <EmptyState icon={<CalendarClock size={20} />} title="Nothing here" />
      ) : (
        <ul className="-my-3 divide-y divide-line">
          {plans.map((p) => (
            <li key={p.key} className="flex items-center gap-3 py-3">
              <ToneIcon tone={p.status === "active" ? "brand" : "neutral"}>
                <Repeat size={18} />
              </ToneIcon>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <p className="truncate text-[14px] font-semibold text-ink">{p.name}</p>
                  <StatusBadge p={p} />
                </div>
                <p className="truncate text-[12px] text-ink-2">
                  {[
                    p.interval ? `${fmt.money(p.amount)} per ${per(p.interval)}` : `${fmt.money(p.amount)} once`,
                    p.paymentMethod || null,
                    p.cardName || null,
                    `since ${fmtMonth(p.first)}`,
                  ]
                    .filter(Boolean)
                    .join(" · ")}
                </p>
              </div>
              <div className="shrink-0 text-right">
                {p.next && p.status !== "ended" ? (
                  <>
                    <p className="text-[13px] font-semibold text-ink">{fmtShortDate(p.next)}</p>
                    <p className="text-[12px] text-ink-3">
                      {p.status === "ending" ? "ends" : "renews"} {inDays(daysBetween(now, p.next))}
                    </p>
                  </>
                ) : (
                  <>
                    <p className="text-[13px] font-semibold text-ink">{fmt.money(p.total)}</p>
                    <p className="text-[12px] text-ink-3">{p.status === "ended" ? `ended ${fmtShortDate(p.next!)}` : fmtShortDate(p.last)}</p>
                  </>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

function StatusBadge({ p }: { p: SubscriptionPlan }) {
  switch (p.status) {
    case "active":
      return (
        <Badge tone="brand">
          <Repeat size={11} /> {p.frequency}
        </Badge>
      );
    case "ending":
      return (
        <Badge tone="warn">
          <CirclePause size={11} /> Auto-renew off
        </Badge>
      );
    case "ended":
      return <Badge tone="neutral">Ended</Badge>;
    case "one-time":
      return (
        <Badge tone="neutral">
          <CircleCheck size={11} /> One-time
        </Badge>
      );
  }
}

/** Every subscription payment, newest first. */
function History({ className }: { className?: string }) {
  const { data, fmt } = useDashboard();
  const [all, setAll] = useState(false);
  const list = data!.subscriptions;
  const shown = all ? list : list.slice(0, 8);
  return (
    <Card className={className} title="Payments" subtitle="Also counted in your spending, as Subscriptions">
      <ul className="-my-3 divide-y divide-line">
        {shown.map((s) => (
          <li key={s.id} className="flex items-center gap-3 py-3">
            <div className="grid w-11 shrink-0 place-items-center rounded-lg bg-surface-2 py-1 text-center leading-tight">
              <span className="text-[11px] font-semibold text-brand-ink uppercase">{fmtMonthShort(s.date)}</span>
              <span className="text-[16px] font-semibold text-ink">{s.date.getDate()}</span>
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate text-[14px] font-medium text-ink">{s.name}</p>
              <p className="truncate text-[12px] text-ink-2">{[s.frequency, s.paymentMethod, s.remark].filter(Boolean).join(" · ")}</p>
            </div>
            <span className="shrink-0 text-[14px] font-semibold tabular-nums text-ink">{fmt.moneyExact(s.amount)}</span>
          </li>
        ))}
      </ul>
      {list.length > 8 && (
        <Button variant="outline" className="mt-4 w-full" onClick={() => setAll(!all)}>
          {all ? "Show fewer" : `Show all ${list.length}`}
        </Button>
      )}
    </Card>
  );
}
