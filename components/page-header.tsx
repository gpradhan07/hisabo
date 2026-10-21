"use client";

import { CalendarDays } from "lucide-react";
import type { ReactNode } from "react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { addDays } from "@/lib/dates";
import { fmtDate } from "@/lib/format";
import { PERIODS, type PeriodId } from "@/lib/periods";
import { cn } from "@/lib/utils";
import { useDashboard } from "./data-provider";
import { Segmented } from "./kit";

/** Page title + the period filter that scopes everything below it (Select on phones, button group from `sm`). */
export function PageHeader({
  title,
  subtitle,
  withPeriod = true,
  extra,
  titleClassName,
}: {
  title: ReactNode;
  subtitle?: string;
  withPeriod?: boolean;
  /** an optional row under the subtitle (e.g. the greeting's chips) */
  extra?: ReactNode;
  /** overrides the title size (the Overview greeting is larger) */
  titleClassName?: string;
}) {
  const { period, setPeriod, range, data } = useDashboard();
  const from = period === "all" && data?.expenses.length ? data.expenses.at(-1)!.date : range.start;

  return (
    <div className="mb-5 flex flex-col gap-4 sm:mb-6 lg:flex-row lg:items-end lg:justify-between">
      <div className="min-w-0">
        <h1 className={cn("text-[22px] leading-tight font-semibold tracking-tight sm:text-[28px]", titleClassName)}>{title}</h1>
        <p className="mt-0.5 truncate text-[13px] text-muted-foreground">
          {subtitle ?? (data ? `${fmtDate(from)} – ${fmtDate(addDays(range.dataEnd, -1))}` : " ")}
        </p>
        {extra}
      </div>
      {withPeriod && (
        <>
          <Select value={period} onValueChange={(v) => setPeriod(v as PeriodId)}>
            <SelectTrigger className="h-10! w-full bg-card sm:hidden" aria-label="Time period">
              <CalendarDays className="text-muted-foreground" />
              <SelectValue />
            </SelectTrigger>
            <SelectContent align="end">
              {PERIODS.map((p) => (
                <SelectItem key={p.id} value={p.id}>
                  {p.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <div className="hidden sm:block">
            <Segmented label="Time period" value={period} onChange={setPeriod} options={PERIODS.map((p) => ({ value: p.id, label: p.label }))} />
          </div>
        </>
      )}
    </div>
  );
}
