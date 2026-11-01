"use client";

import { CalendarClock, CircleAlert, CircleCheck, Clock, Landmark, Plus } from "lucide-react";
import { useMemo, useState } from "react";
import { ColumnChart } from "@/components/charts/column-chart";
import { Ring } from "@/components/charts/small";
import { useDashboard } from "@/components/data-provider";
import { DeleteButton, DeleteDialog, useCanDelete, useHidden, type DeleteTarget } from "@/components/delete-dialog";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Badge, Card, EmptyState, Skeleton, StatGrid, StatTile, cx } from "@/components/kit";
import { debtFreeDate, emiOutlook, emiProgress, type EmiProgress } from "@/lib/analytics";
import { addMonths, daysBetween, startOfDay, startOfMonth } from "@/lib/dates";
import { fmtDate, fmtMonth, fmtMonthShort, fmtShortDate, type Formatters } from "@/lib/format";
import type { EmiPayment } from "@/lib/types";

const ORDER = { active: 0, upcoming: 1, unknown: 2, completed: 3 };
const monthYear = (d: Date) => `${fmtMonthShort(d)} ’${String(d.getFullYear()).slice(2)}`;

export function EmisView() {
  const { data, fmt, now, profile, setEmiOpen } = useDashboard();
  const canDelete = useCanDelete();
  const hidden = useHidden();
  const [toDelete, setToDelete] = useState<DeleteTarget | null>(null);

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
  const unfinished = rows.filter((r) => r.status !== "completed").length;
  const paid = rows.reduce((s, r) => s + r.paidAmount, 0);
  const freeBy = debtFreeDate(rows);

  // An EMI goes together with its recorded payments, so none are left behind in the sheet.
  const deleteEmi = (r: EmiProgress): DeleteTarget => {
    const payments = data.emiPayments.filter((x) => x.emiName.trim().toLowerCase() === r.emi.name.trim().toLowerCase());
    return {
      question: `Delete the ${r.emi.name} EMI?`,
      note: payments.length
        ? `It and its ${payments.length} recorded ${payments.length === 1 ? "payment" : "payments"} are removed from your Google Sheet too. This can't be undone.`
        : undefined,
      title: r.emi.name,
      detail: `a month · ${r.emi.tenure} months${payments.length ? ` · ${payments.length} ${payments.length === 1 ? "payment" : "payments"} recorded` : ""}`,
      amount: r.emi.monthly,
      done: `Deleted the ${r.emi.name} EMI`,
      items: [
        { id: r.emi.id, amount: r.emi.monthly, name: r.emi.name },
        ...payments.map((x) => ({ id: x.id, date: x.date.toISOString(), amount: x.amount, name: x.emiName })),
      ],
      hide: [r.emi.id, ...payments.map((x) => x.id)],
    };
  };
  const deletePayment = (x: EmiPayment): DeleteTarget => ({
    question: "Delete this payment?",
    title: x.emiName,
    detail: [fmtDate(x.date), x.cardName || x.paymentMethod || null].filter(Boolean).join(" · "),
    amount: x.amount,
    done: `Deleted ${fmt.moneyExact(x.amount)} · ${x.emiName}`,
    items: [{ id: x.id, date: x.date.toISOString(), amount: x.amount, name: x.emiName }],
    hide: [x.id],
  });

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
            <StatTile
              label="Paying monthly"
              value={fmt.money(monthly)}
              sub={`${running.length} active ${running.length === 1 ? "EMI" : "EMIs"}${profile?.monthlyIncome ? ` · ${fmt.percent(monthly / profile.monthlyIncome)} of your income` : ""}`}
            />
            <StatTile label="Left to pay" value={fmt.money(left)} sub={`across ${unfinished} ${unfinished === 1 ? "EMI" : "EMIs"} still running`} />
            <StatTile label="Paid so far" value={fmt.money(paid)} sub={`${Math.round((paid / Math.max(1, paid + left)) * 100)}% of the total EMI amount`} />
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
            {rows
              .filter((r) => !hidden.ids.has(r.emi.id))
              .map((r) => (
                <EmiCard key={r.emi.id} p={r} fmt={fmt} onDelete={canDelete ? () => setToDelete(deleteEmi(r)) : undefined} />
              ))}
          </div>
          {data.emiPayments.length > 0 && (
            <Payments hidden={hidden.ids} onDelete={canDelete ? (x) => setToDelete(deletePayment(x)) : undefined} className="lg:col-span-12" />
          )}
        </div>
      )}
      <DeleteDialog target={toDelete} onClose={() => setToDelete(null)} onDeleted={(t) => hidden.hide(t.hide)} />
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
      title="EMIs, next 12 months"
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
        <ul className="-my-3.5 divide-y divide-line">
          {items.map(({ p, due, n }) => {
            // With payments recorded, "paid" means recorded; otherwise it goes by the date, as before.
            const done = p.tracked ? n <= p.paidMonths : due <= now;
            const missed = p.tracked && !done && due < startOfDay(now);
            return (
              <li key={p.emi.id + n} className="flex items-center gap-3 py-3.5">
                <div className="grid w-11 shrink-0 place-items-center rounded-lg bg-surface-2 py-1 text-center leading-tight">
                  <span className="text-[11px] font-semibold text-brand-ink uppercase">{fmtMonthShort(due)}</span>
                  <span className="text-[16px] font-semibold text-ink">{due.getDate()}</span>
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[14px] font-medium text-ink">{p.emi.name}</p>
                  <p className="mt-0.5 text-[12px] text-ink-2">
                    Instalment {n} of {p.emi.tenure}
                  </p>
                </div>
                <div className="flex flex-col items-end gap-1">
                  <span className="text-[14px] font-semibold tabular-nums text-ink">{fmt.money(p.emi.monthly)}</span>
                  {done ? (
                    <Badge tone="good">
                      <CircleCheck size={11} /> Paid
                    </Badge>
                  ) : missed ? (
                    <Badge tone="warn">
                      <CircleAlert size={11} /> Payment due
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
                  <p className="mt-0.5 text-[12px] text-ink-3">
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

function EmiCard({ p, fmt, onDelete }: { p: EmiProgress; fmt: Formatters; onDelete?: () => void }) {
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
          <div className="-mt-1 -mr-2 flex shrink-0 items-center gap-0.5">
            <StatusBadge p={p} />
            {onDelete && <DeleteButton label={`Delete the ${emi.name} EMI`} onClick={onDelete} />}
          </div>
        </div>
        <p className="mt-0.5 text-[13px] text-ink-2">
          <span className="font-semibold text-ink">{fmt.money(emi.monthly)}</span>/mo · {emi.tenure} months{emi.type && <> · {emi.type}</>}
        </p>
        <dl className="mt-3.5 grid grid-cols-2 gap-x-2 gap-y-3 text-[12px]">
          <div>
            <dt className="text-ink-3">Paid</dt>
            <dd className="mt-0.5 font-medium text-ink">
              {p.paidMonths}/{emi.tenure} · {fmt.moneyCompact(p.paidAmount)}
            </dd>
          </div>
          <div>
            <dt className="text-ink-3">{status === "completed" ? "Finished" : "Left"}</dt>
            <dd className="mt-0.5 font-medium text-ink">{status === "completed" ? fmtMonth(p.endDate!) : fmt.moneyCompact(p.remainingAmount)}</dd>
          </div>
          {p.nextDue && (
            <div>
              <dt className="text-ink-3">{status === "upcoming" ? "Starts" : "Next due"}</dt>
              <dd className="mt-0.5 font-medium text-ink">{fmtShortDate(p.nextDue)}</dd>
            </div>
          )}
          {p.endDate && status !== "completed" && (
            <div>
              <dt className="text-ink-3">Ends</dt>
              <dd className="mt-0.5 font-medium text-ink">{fmtMonth(p.endDate)}</dd>
            </div>
          )}
        </dl>
        {p.tracked && (
          <p className="mt-3 text-[12px] text-ink-3">
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
function Payments({ hidden, onDelete, className }: { hidden: ReadonlySet<string>; onDelete?: (x: EmiPayment) => void; className?: string }) {
  const { data, fmt } = useDashboard();
  const [all, setAll] = useState(false);
  const list = data!.emiPayments.filter((x) => !hidden.has(x.id));
  const shown = all ? list : list.slice(0, 6);
  return (
    <Card className={className} title="Recorded payments" subtitle={`${list.length} from your Shortcut, newest first`}>
      <ul className="-my-3.5 divide-y divide-line">
        {shown.map((p) => (
          <li key={p.id} className="flex items-center gap-3 py-3.5">
            <div className="grid w-11 shrink-0 place-items-center rounded-lg bg-surface-2 py-1 text-center leading-tight">
              <span className="text-[11px] font-semibold text-brand-ink uppercase">{fmtMonthShort(p.date)}</span>
              <span className="text-[16px] font-semibold text-ink">{p.date.getDate()}</span>
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate text-[14px] font-medium text-ink">{p.emiName}</p>
              <p className="mt-0.5 truncate text-[12px] text-ink-2">{[p.paymentMethod, p.cardName, p.remark].filter(Boolean).join(" · ") || "Payment"}</p>
            </div>
            <span className="shrink-0 text-[14px] font-semibold tabular-nums text-ink">{fmt.moneyExact(p.amount)}</span>
            {onDelete && <DeleteButton label={`Delete ${p.emiName} payment of ${fmtDate(p.date)}`} onClick={() => onDelete(p)} className="-mr-1" />}
          </li>
        ))}
      </ul>
      {list.length > 6 && (
        <Button variant="outline" className="mt-5 w-full" onClick={() => setAll(!all)}>
          {all ? "Show fewer" : `Show all ${list.length}`}
        </Button>
      )}
    </Card>
  );
}
