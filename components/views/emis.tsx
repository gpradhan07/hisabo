"use client";

import { CalendarClock, CircleAlert, CircleCheck, Clock, Landmark, Plus } from "lucide-react";
import { useMemo, useState } from "react";
import { ColumnChart } from "@/components/charts/column-chart";
import { Ring } from "@/components/charts/small";
import { useDashboard } from "@/components/data-provider";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Badge, Card, EmptyState, Skeleton, StatGrid, StatTile, cx } from "@/components/kit";
import { debtFreeDate, emiOutlook, emiProgress, type EmiProgress } from "@/lib/analytics";
import { addMonths, daysBetween, startOfMonth } from "@/lib/dates";
import { fmtMonth, fmtMonthShort, fmtShortDate, type Formatters } from "@/lib/format";

const ORDER = { active: 0, upcoming: 1, unknown: 2, completed: 3 };
const monthYear = (d: Date) => `${fmtMonthShort(d)} ’${String(d.getFullYear()).slice(2)}`;

export function EmisView() {
  const { data, fmt, now, setEmiOpen } = useDashboard();

  const rows = useMemo(
    () =>
      (data?.emis ?? [])
        .map((e) => emiProgress(e, now, data?.emiPayments))
        .sort((a, b) => ORDER[a.status] - ORDER[b.status] || (a.nextDue?.getTime() ?? Infinity) - (b.nextDue?.getTime() ?? Infinity)),
    [data, now],
  );

  if (!data) {
    return (
      <>
        <PageHeader title="EMIs" subtitle="Current position, as of today" withPeriod={false} />
        <Skeleton className="h-130" />
      </>
    );
  }

  const running = rows.filter((r) => r.status === "active");
  const monthly = running.reduce((s, r) => s + r.emi.monthly, 0);
  const left = rows.reduce((s, r) => s + r.remainingAmount, 0);
  const paid = rows.reduce((s, r) => s + r.paidAmount, 0);
  const freeBy = debtFreeDate(rows);

  return (
    <>
      <PageHeader title="EMIs" subtitle="Current position, as of today" withPeriod={false} />
      {!rows.length ? (
        <Card>
          <EmptyState icon={<Landmark size={20} />} title="No EMIs yet" body="Add one here, or from your iPhone Shortcut with Type set to EMI." />
          <div className="flex justify-center pb-2">
            <Button size="lg" className="inline-grid grid-cols-[1fr_auto_1fr] gap-0 font-semibold" onClick={() => setEmiOpen(true)}>
              <Plus strokeWidth={2.5} className="mr-1.25 justify-self-end" aria-hidden />
              <span>Add EMI</span>
            </Button>
          </div>
        </Card>
      ) : (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-12 lg:gap-5">
          <StatGrid className="lg:col-span-12">
            <StatTile label="Paying monthly" value={fmt.money(monthly)} sub={`${running.length} active ${running.length === 1 ? "EMI" : "EMIs"}`} />
            <StatTile label="Left to pay" value={fmt.money(left)} sub={`across ${rows.length} ${rows.length === 1 ? "EMI" : "EMIs"}`} />
            <StatTile label="Paid so far" value={fmt.money(paid)} sub={`${Math.round((paid / Math.max(1, paid + left)) * 100)}% of all EMIs`} />
            <StatTile
              label="EMI-free by"
              value={freeBy ? fmtMonth(freeBy) : "Now"}
              sub={freeBy ? `in ${Math.max(1, Math.round(daysBetween(now, freeBy) / 30.44))} months` : "no active EMIs"}
            />
          </StatGrid>

          <Outlook className="lg:col-span-7" />
          <DueThisMonth rows={rows} className="lg:col-span-5" />
          <Timeline rows={rows} className="lg:col-span-12" />

          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:col-span-12 lg:gap-5 xl:grid-cols-3">
            {rows.map((r) => (
              <EmiCard key={r.emi.id} p={r} fmt={fmt} />
            ))}
          </div>
          {data.emiPayments.length > 0 && <Payments className="lg:col-span-12" />}
        </div>
      )}
    </>
  );
}

function Outlook({ className }: { className?: string }) {
  const { data, fmt, now } = useDashboard();
  const months = useMemo(() => emiOutlook(data!.emis, now, 12), [data, now]);
  const drop = months.findIndex((m, i) => i > 0 && m.total < months[i - 1].total);

  return (
    <Card
      className={cx("flex flex-col", className)}
      title="EMI outlook"
      subtitle={drop > 0 ? `Your EMIs drop to ${fmt.money(months[drop].total)}/month from ${months[drop].label}` : "Total EMI due each month, next 12 months"}
    >
      <ColumnChart
        ariaLabel="EMI due per month for the next 12 months"
        valueName="Due"
        highlight={0}
        data={months.map((m) => ({
          value: m.total,
          tick: m.tick,
          label: m.label,
          detail: m.loans.length ? m.loans.map((l) => `${l.name} ${fmt.moneyCompact(l.amount)}`).join(" · ") : "No EMIs",
        }))}
        fmt={fmt}
      />
    </Card>
  );
}

function DueThisMonth({ rows, className }: { rows: EmiProgress[]; className?: string }) {
  const { fmt, now } = useDashboard();
  const start = startOfMonth(now);
  const end = addMonths(start, 1);
  const items = rows
    .filter((r) => r.emi.startDate)
    .flatMap((r) => {
      const out: { p: EmiProgress; due: Date; n: number }[] = [];
      for (let k = 0; k < r.emi.tenure; k++) {
        const due = addMonths(r.emi.startDate!, k);
        if (due >= end) break;
        if (due >= start) out.push({ p: r, due, n: k + 1 });
      }
      return out;
    })
    .sort((a, b) => a.due.getTime() - b.due.getTime());
  const total = items.reduce((s, i) => s + i.p.emi.monthly, 0);

  return (
    <Card className={className} title={`Due in ${new Intl.DateTimeFormat(undefined, { month: "long" }).format(now)}`} subtitle={`${fmt.money(total)} across ${items.length} instalments`}>
      {!items.length ? (
        <EmptyState icon={<CalendarClock size={20} />} title="Nothing due this month" />
      ) : (
        <ul className="-my-3 divide-y divide-line">
          {items.map(({ p, due, n }) => {
            const done = due <= now;
            return (
              <li key={p.emi.id + n} className="flex items-center gap-3 py-3">
                <div className="grid w-11 shrink-0 place-items-center rounded-lg bg-surface-2 py-1 text-center leading-tight">
                  <span className="text-[11px] font-semibold text-brand-ink uppercase">{fmtMonthShort(due)}</span>
                  <span className="text-[16px] font-semibold text-ink">{due.getDate()}</span>
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[14px] font-medium text-ink">{p.emi.name}</p>
                  <p className="text-[12px] text-ink-2">
                    Instalment {n} of {p.emi.tenure}
                  </p>
                </div>
                <div className="flex flex-col items-end gap-1">
                  <span className="text-[14px] font-semibold tabular-nums text-ink">{fmt.money(p.emi.monthly)}</span>
                  {done ? (
                    <Badge tone="good">
                      <CircleCheck size={11} /> Paid
                    </Badge>
                  ) : (
                    <Badge tone="brand">
                      <Clock size={11} /> Due
                    </Badge>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </Card>
  );
}

/** Each EMI as a bar from its first to last instalment; the solid part is paid. */
function Timeline({ rows, className }: { rows: EmiProgress[]; className?: string }) {
  const { now } = useDashboard();
  const dated = rows.filter((r) => r.emi.startDate && r.endDate);
  if (!dated.length) return null;

  const min = startOfMonth(new Date(Math.min(...dated.map((r) => r.emi.startDate!.getTime()))));
  const max = addMonths(startOfMonth(new Date(Math.max(...dated.map((r) => r.endDate!.getTime())))), 1);
  const span = max.getTime() - min.getTime();
  const pos = (d: Date) => `${Math.min(100, Math.max(0, ((d.getTime() - min.getTime()) / span) * 100))}%`;
  const totalMonths = (max.getFullYear() - min.getFullYear()) * 12 + max.getMonth() - min.getMonth();
  const step = totalMonths > 30 ? 6 : totalMonths > 14 ? 3 : 1;
  const ticks: Date[] = [];
  for (let d = min; d < max; d = addMonths(d, step)) ticks.push(d);

  return (
    <Card className={className} title="Timeline" subtitle="Each EMI from first to last instalment · the solid part is paid">
      <div className="overflow-x-auto">
        <div className="relative min-w-140">
          <div className="relative ml-36 h-6 border-b border-line">
            {ticks.map((t) => (
              <span key={t.getTime()} className="absolute -translate-x-1/2 text-[11px] whitespace-nowrap text-ink-3" style={{ left: pos(t) }}>
                {monthYear(t)}
              </span>
            ))}
          </div>
          <div className="relative">
            <div className="absolute inset-y-0 right-0 left-36">
              <div className="absolute inset-y-0 w-px bg-ink" style={{ left: pos(now) }} />
              <span className="absolute -top-0 -translate-x-1/2 rounded-full bg-ink px-1.5 text-[11px] font-semibold text-page" style={{ left: pos(now) }}>
                Today
              </span>
            </div>
            {dated.map((r) => (
              <div key={r.emi.id} className="flex items-center py-2.5 first:pt-6">
                <div className="w-36 shrink-0 pr-3">
                  <p className="truncate text-[13px] font-medium text-ink">{r.emi.name}</p>
                  <p className="text-[12px] text-ink-3">
                    {monthYear(r.emi.startDate!)} → {monthYear(r.endDate!)}
                  </p>
                </div>
                <div className="relative h-3 flex-1">
                  <div
                    className="absolute inset-y-0 overflow-hidden rounded-full bg-brand-soft"
                    style={{ left: pos(r.emi.startDate!), width: `calc(${pos(addMonths(r.endDate!, 1))} - ${pos(r.emi.startDate!)})` }}
                  >
                    <div className="h-full rounded-full bg-brand" style={{ width: `${(r.paidMonths / r.emi.tenure) * 100}%` }} />
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </Card>
  );
}

function EmiCard({ p, fmt }: { p: EmiProgress; fmt: Formatters }) {
  const { emi, status } = p;
  const pct = emi.tenure ? p.paidMonths / emi.tenure : 0;
  return (
    <section className="card flex items-center gap-5 p-5">
      <Ring value={p.paidMonths} max={emi.tenure} size={84} thickness={9} color={status === "completed" ? "var(--good)" : "var(--brand)"}>
        <span className="text-[16px] font-semibold text-ink">{Math.round(pct * 100)}%</span>
      </Ring>
      <div className="min-w-0 flex-1">
        <div className="flex items-start justify-between gap-2">
          <p className="truncate text-[15px] font-semibold text-ink">{emi.name}</p>
          <StatusBadge p={p} />
        </div>
        <p className="mt-0.5 text-[13px] text-ink-2">
          <span className="font-semibold text-ink">{fmt.money(emi.monthly)}</span>/mo · {emi.tenure} months{emi.type && <> · {emi.type}</>}
        </p>
        <dl className="mt-3 grid grid-cols-2 gap-2 text-[12px]">
          <div>
            <dt className="text-ink-3">Paid</dt>
            <dd className="font-medium text-ink">
              {p.paidMonths}/{emi.tenure} · {fmt.moneyCompact(p.paidAmount)}
            </dd>
          </div>
          <div>
            <dt className="text-ink-3">{status === "completed" ? "Finished" : "Left"}</dt>
            <dd className="font-medium text-ink">{status === "completed" ? fmtMonth(p.endDate!) : fmt.moneyCompact(p.remainingAmount)}</dd>
          </div>
          {p.nextDue && (
            <div>
              <dt className="text-ink-3">{status === "upcoming" ? "Starts" : "Next due"}</dt>
              <dd className="font-medium text-ink">{fmtShortDate(p.nextDue)}</dd>
            </div>
          )}
          {p.endDate && status !== "completed" && (
            <div>
              <dt className="text-ink-3">Ends</dt>
              <dd className="font-medium text-ink">{fmtMonth(p.endDate)}</dd>
            </div>
          )}
        </dl>
        {p.tracked && (
          <p className="mt-2 text-[12px] text-ink-3">
            Counted from {p.recorded} recorded {p.recorded === 1 ? "payment" : "payments"}
            {emi.paidBefore > 0 && ` + ${emi.paidBefore} paid before`}
          </p>
        )}
      </div>
    </section>
  );
}

function StatusBadge({ p }: { p: EmiProgress }) {
  if (p.overdue) return <Badge tone="warn"><CircleAlert size={11} /> Payment due</Badge>;
  switch (p.status) {
    case "active":
      return <Badge tone="brand"><CalendarClock size={11} /> Active</Badge>;
    case "upcoming":
      return <Badge tone="neutral"><Clock size={11} /> Upcoming</Badge>;
    case "completed":
      return <Badge tone="good"><CircleCheck size={11} /> Done</Badge>;
    case "unknown":
      return <Badge tone="warn"><CircleAlert size={11} /> No start date</Badge>;
  }
}

/** EMI payments recorded from the Shortcut (Record payment), newest first. */
function Payments({ className }: { className?: string }) {
  const { data, fmt } = useDashboard();
  const [all, setAll] = useState(false);
  const list = data!.emiPayments;
  const shown = all ? list : list.slice(0, 6);
  return (
    <Card className={className} title="Recorded payments" subtitle={`${list.length} from your Shortcut, newest first`}>
      <ul className="-my-3 divide-y divide-line">
        {shown.map((p) => (
          <li key={p.id} className="flex items-center gap-3 py-3">
            <div className="grid w-11 shrink-0 place-items-center rounded-lg bg-surface-2 py-1 text-center leading-tight">
              <span className="text-[11px] font-semibold text-brand-ink uppercase">{fmtMonthShort(p.date)}</span>
              <span className="text-[16px] font-semibold text-ink">{p.date.getDate()}</span>
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate text-[14px] font-medium text-ink">{p.emiName}</p>
              <p className="truncate text-[12px] text-ink-2">{[p.paymentMethod, p.cardName, p.remark].filter(Boolean).join(" · ") || "Payment"}</p>
            </div>
            <span className="shrink-0 text-[14px] font-semibold tabular-nums text-ink">{fmt.moneyExact(p.amount)}</span>
          </li>
        ))}
      </ul>
      {list.length > 6 && (
        <Button variant="outline" className="mt-4 w-full" onClick={() => setAll(!all)}>
          {all ? "Show fewer" : `Show all ${list.length}`}
        </Button>
      )}
    </Card>
  );
}
