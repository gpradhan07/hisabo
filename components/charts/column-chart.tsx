"use client";

import { Bar, BarChart, CartesianGrid, LabelList, ReferenceLine, XAxis, YAxis } from "recharts";
import { ChartContainer, ChartTooltip, type ChartConfig } from "@/components/ui/chart";
import type { Formatters } from "@/lib/format";
import { TipCard, type TickArgs, type TooltipArgs, niceTicks } from "./shared";

export interface ColumnDatum {
  value: number;
  /** axis tick */
  tick: string;
  /** tooltip heading */
  label: string;
  /** extra tooltip line */
  detail?: string;
  future?: boolean;
}

interface Row extends ColumnDatum {
  idx: number;
  /** set on the first highest bar only, so exactly one value label is drawn */
  peak: number | null;
}

/**
 * Single-series column chart (shadcn chart + Recharts): hairline grid, ≤28px bars with 4px rounded tops,
 * a label on the peak only, an optional dashed average line, and a hover readout.
 */
export function ColumnChart({
  data,
  fmt,
  height = 260,
  highlight = -1,
  average = null,
  color = "var(--brand)",
  valueName = "Spent",
  ariaLabel,
}: {
  data: ColumnDatum[];
  fmt: Formatters;
  height?: number;
  highlight?: number;
  average?: number | null;
  color?: string;
  valueName?: string;
  ariaLabel: string;
}) {
  const max = Math.max(0, ...data.map((d) => d.value));
  const peakIdx = max > 0 ? data.findIndex((d) => d.value === max) : -1;
  const rows: Row[] = data.map((d, idx) => ({ ...d, idx, peak: idx === peakIdx ? max : null }));
  const { ticks, top } = niceTicks(Math.max(max, average ?? 0));
  const config = { value: { label: valueName, color } } satisfies ChartConfig;

  return (
    <ChartContainer config={config} className="aspect-auto w-full" style={{ height }} role="img" aria-label={ariaLabel}>
      <BarChart data={rows} margin={{ top: 22, right: 4, bottom: 0, left: 0 }} accessibilityLayer>
        <CartesianGrid vertical={false} />
        <XAxis
          dataKey="idx"
          tickLine={false}
          axisLine={false}
          tickMargin={8}
          minTickGap={12}
          interval="preserveStartEnd"
          tickFormatter={(i: number) => rows[i]?.tick ?? ""}
          tick={(p: TickArgs) => {
            const i = Number(p.payload?.value);
            const r = rows[i];
            const isNow = i === highlight;
            return (
              <text
                x={p.x}
                y={p.y}
                dy={10}
                textAnchor="middle"
                fontSize={11}
                fontWeight={isNow ? 600 : 400}
                fill={isNow ? "var(--foreground)" : "var(--muted-foreground)"}
                opacity={r?.future ? 0.5 : 1}
              >
                {r?.tick}
              </text>
            );
          }}
        />
        <YAxis domain={[0, top]} ticks={ticks} tickFormatter={(v: number) => fmt.moneyCompact(v)} tickLine={false} axisLine={false} width={60} tick={{ fontSize: 11 }} />
        <ChartTooltip
          cursor={{ fill: "var(--muted)", radius: 6 }}
          content={({ active, payload }: TooltipArgs<Row>) => {
            const r = active && payload?.[0]?.payload;
            if (!r || r.future) return null;
            return <TipCard title={r.label} lines={[{ color, name: valueName, value: fmt.money(r.value) }]} note={r.detail} />;
          }}
        />
        {average !== null && average > 0 && (
          <ReferenceLine
            y={average}
            stroke="var(--ink-3)"
            strokeDasharray="4 4"
            label={{ value: `avg ${fmt.moneyCompact(average)}`, position: "insideTopRight", fill: "var(--muted-foreground)", fontSize: 11 }}
          />
        )}
        <Bar dataKey="value" fill={color} radius={[4, 4, 0, 0]} maxBarSize={28} activeBar={{ fillOpacity: 0.8 }}>
          <LabelList
            dataKey="peak"
            content={(p: { x?: number | string; y?: number | string; width?: number | string; value?: unknown }) =>
              typeof p.value === "number" ? (
                <text x={Number(p.x) + Number(p.width) / 2} y={Number(p.y) - 8} textAnchor="middle" fontSize={11} fontWeight={600} fill="var(--foreground)">
                  {fmt.moneyCompact(max)}
                </text>
              ) : null
            }
          />
        </Bar>
      </BarChart>
    </ChartContainer>
  );
}
