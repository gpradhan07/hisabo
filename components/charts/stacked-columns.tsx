"use client";

import { Bar, BarChart, CartesianGrid, XAxis, YAxis } from "recharts";
import { ChartContainer, ChartTooltip, type ChartConfig } from "@/components/ui/chart";
import type { MonthStack } from "@/lib/analytics";
import type { Formatters } from "@/lib/format";
import { LegendItem, TipCard, type TickArgs, type TooltipArgs, niceTicks } from "./shared";

/** Monthly totals split by category (shadcn stacked bar). Slot order is fixed, so a category keeps its colour everywhere. */
export function StackedColumns({
  months,
  names,
  colors,
  fmt,
  height = 300,
  highlight = -1,
}: {
  months: MonthStack[];
  /** one name per part, "Other" last */
  names: string[];
  colors: string[];
  fmt: Formatters;
  height?: number;
  highlight?: number;
}) {
  const keys = names.map((_, k) => `s${k}`);
  const used = keys.filter((_, k) => months.some((m) => m.parts[k] > 0));
  const lastUsed = used.at(-1);
  const rows = months.map((m, idx) => ({ idx, label: m.label, tick: m.tick, total: m.total, ...Object.fromEntries(m.parts.map((v, k) => [`s${k}`, v])) }));
  const { ticks, top } = niceTicks(Math.max(0, ...months.map((m) => m.total)));
  const config = Object.fromEntries(keys.map((key, k) => [key, { label: names[k], color: colors[k] }])) satisfies ChartConfig;

  return (
    <div>
      <div className="mb-3 flex flex-wrap gap-x-4 gap-y-1.5 text-muted-foreground">
        {used.map((key) => {
          const k = Number(key.slice(1));
          return <LegendItem key={key} color={colors[k]} label={names[k]} />;
        })}
      </div>
      <ChartContainer config={config} className="aspect-auto w-full" style={{ height }}>
        <BarChart data={rows} margin={{ top: 8, right: 4, bottom: 0, left: 0 }} accessibilityLayer>
          <CartesianGrid vertical={false} />
          <XAxis
            dataKey="idx"
            tickLine={false}
            axisLine={false}
            tickMargin={8}
            minTickGap={12}
            tickFormatter={(i: number) => rows[i]?.tick ?? ""}
            tick={(p: TickArgs) => {
              const i = Number(p.payload?.value);
              return (
                <text
                  x={p.x}
                  y={p.y}
                  dy={10}
                  textAnchor="middle"
                  fontSize={11}
                  fontWeight={i === highlight ? 600 : 400}
                  fill={i === highlight ? "var(--foreground)" : "var(--muted-foreground)"}
                >
                  {rows[i]?.tick}
                </text>
              );
            }}
          />
          <YAxis domain={[0, top]} ticks={ticks} tickFormatter={(v: number) => fmt.moneyCompact(v)} tickLine={false} axisLine={false} width={60} tick={{ fontSize: 11 }} />
          <ChartTooltip
            cursor={{ fill: "var(--muted)", radius: 6 }}
            content={({ active, payload }: TooltipArgs<(typeof rows)[number]>) => {
              const r = active && payload?.[0]?.payload;
              if (!r) return null;
              const lines = keys
                .map((key, k) => ({ k, v: (r as unknown as Record<string, number>)[key] ?? 0 }))
                .filter((x) => x.v > 0)
                .reverse()
                .map((x) => ({ color: colors[x.k], name: names[x.k], value: fmt.money(x.v) }));
              return <TipCard title={`${r.label} · ${fmt.money(r.total)}`} lines={lines} />;
            }}
          />
          {used.map((key) => {
            const k = Number(key.slice(1));
            return (
              <Bar
                key={key}
                dataKey={key}
                stackId="month"
                fill={colors[k]}
                stroke="var(--card)"
                strokeWidth={1.5}
                maxBarSize={32}
                radius={key === lastUsed ? [4, 4, 0, 0] : [0, 0, 0, 0]}
              />
            );
          })}
        </BarChart>
      </ChartContainer>
    </div>
  );
}
