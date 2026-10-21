"use client";

import { useId } from "react";
import { Area, AreaChart, CartesianGrid, Line, ReferenceLine, XAxis, YAxis } from "recharts";
import { ChartContainer, ChartTooltip, type ChartConfig } from "@/components/ui/chart";
import type { Formatters } from "@/lib/format";
import { LegendItem, TipCard, type TooltipArgs, niceTicks } from "./shared";

interface Point {
  i: number;
  current: number | null;
  reference: number | null;
}

/**
 * Running total for the period (area with gradient) against the whole previous period (line).
 * `onBrand` draws for the dark-green hero card.
 */
export function PaceChart({
  current,
  reference,
  currentLabel,
  referenceLabel,
  budget,
  pointLabel,
  ticks,
  fmt,
  height = 170,
  onBrand = false,
}: {
  current: (number | null)[];
  reference: (number | null)[] | null;
  currentLabel: string;
  referenceLabel?: string;
  budget?: number | null;
  pointLabel: (i: number) => string;
  ticks: { i: number; label: string }[];
  fmt: Formatters;
  height?: number;
  onBrand?: boolean;
}) {
  const gid = useId().replace(/:/g, "");
  const n = Math.max(current.length, reference?.length ?? 0);
  const data: Point[] = Array.from({ length: n }, (_, i) => ({ i, current: current[i] ?? null, reference: reference?.[i] ?? null }));
  const max = Math.max(1, budget ?? 0, ...current.map((v) => v ?? 0), ...(reference ?? []).map((v) => v ?? 0));
  const { ticks: yTicks, top } = niceTicks(max, 3);
  const tickMap = new Map(ticks.map((t) => [t.i, t.label]));

  const c = onBrand
    ? { cur: "#48d6a0", ref: "rgb(242 247 243 / 0.55)", grid: "rgb(242 247 243 / 0.1)", text: "rgb(242 247 243 / 0.7)" }
    : { cur: "var(--brand)", ref: "var(--ink-3)", grid: "var(--grid)", text: "var(--ink-3)" };

  const config = {
    current: { label: currentLabel, color: c.cur },
    reference: { label: referenceLabel ?? "Previous", color: c.ref },
  } satisfies ChartConfig;

  return (
    <div>
      <div className="mb-2 flex flex-wrap items-center gap-x-4 gap-y-1" style={{ color: c.text }}>
        <LegendItem color={c.cur} label={<span className={onBrand ? "text-white" : "text-foreground"}>{currentLabel}</span>} shape="line" />
        {reference && referenceLabel && <LegendItem color={c.ref} label={referenceLabel} shape="line" />}
        {budget ? <LegendItem color={c.text} label="Budget" shape="dash" /> : null}
      </div>
      <ChartContainer config={config} className="aspect-auto w-full" style={{ height }}>
        <AreaChart data={data} margin={{ top: 6, right: 0, bottom: 0, left: 0 }} accessibilityLayer>
          <defs>
            <linearGradient id={`fill-${gid}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={c.cur} stopOpacity={onBrand ? 0.38 : 0.22} />
              <stop offset="100%" stopColor={c.cur} stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid vertical={false} stroke={c.grid} />
          <XAxis
            dataKey="i"
            type="number"
            domain={[0, Math.max(1, n - 1)]}
            ticks={ticks.map((t) => t.i)}
            tickFormatter={(i: number) => tickMap.get(i) ?? ""}
            tickLine={false}
            axisLine={false}
            tick={{ fill: c.text, fontSize: 11 }}
            tickMargin={8}
          />
          <YAxis
            orientation="right"
            domain={[0, top]}
            ticks={yTicks}
            tickFormatter={(v: number) => (v ? fmt.moneyCompact(v) : "")}
            tickLine={false}
            axisLine={false}
            tick={{ fill: c.text, fontSize: 11 }}
            width={60}
          />
          {budget ? <ReferenceLine y={budget} stroke={c.text} strokeDasharray="4 4" /> : null}
          <ChartTooltip
            cursor={{ stroke: c.text, strokeOpacity: 0.5 }}
            content={({ active, payload }: TooltipArgs<Point>) => {
              const p = active && payload?.[0]?.payload;
              if (!p) return null;
              return (
                <TipCard
                  title={pointLabel(p.i)}
                  lines={[
                    ...(p.current !== null ? [{ color: "var(--brand)", name: currentLabel, value: fmt.money(p.current) }] : []),
                    ...(p.reference !== null && referenceLabel
                      ? [{ color: "var(--ink-3)", name: referenceLabel, value: fmt.money(p.reference), muted: true }]
                      : []),
                  ]}
                />
              );
            }}
          />
          {reference && (
            <Line dataKey="reference" type="monotone" stroke={c.ref} strokeWidth={1.75} dot={false} activeDot={{ r: 4, strokeWidth: 2 }} isAnimationActive={false} />
          )}
          <Area
            dataKey="current"
            type="monotone"
            stroke={c.cur}
            strokeWidth={2.5}
            fill={`url(#fill-${gid})`}
            connectNulls={false}
            dot={false}
            activeDot={{ r: 5, strokeWidth: 2, stroke: onBrand ? "#153f31" : "var(--card)", fill: c.cur }}
          />
        </AreaChart>
      </ChartContainer>
    </div>
  );
}
