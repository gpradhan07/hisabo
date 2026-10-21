"use client";

import { useState } from "react";
import { Label, Pie, PieChart } from "recharts";
import { ChartContainer, ChartTooltip, type ChartConfig } from "@/components/ui/chart";
import type { Formatters } from "@/lib/format";
import { cn } from "@/lib/utils";
import { TipCard, type TooltipArgs } from "./shared";

export interface DonutSegment {
  key: string;
  label: string;
  value: number;
  color: string;
}

/** shadcn donut with the total in the middle. The list beside it carries every value, so colour is never alone. */
export function Donut({
  segments,
  fmt,
  centerLabel = "Total",
  onSelect,
  selected,
}: {
  segments: DonutSegment[];
  fmt: Formatters;
  centerLabel?: string;
  onSelect?: (key: string) => void;
  selected?: string | null;
}) {
  const [hover, setHover] = useState<string | null>(null);
  const total = segments.reduce((s, x) => s + x.value, 0);
  const focus = hover ?? selected ?? null;
  const data = segments.map((s) => ({ ...s, fill: s.color, fillOpacity: !focus || focus === s.key ? 1 : 0.3 }));
  const config = Object.fromEntries(segments.map((s) => [s.key, { label: s.label, color: s.color }])) satisfies ChartConfig;
  const focused = segments.find((s) => s.key === focus);

  return (
    <div className="@container/donut">
    <div className="flex flex-col items-center gap-5 @[460px]/donut:flex-row">
      <ChartContainer config={config} className="aspect-square w-50 shrink-0">
        <PieChart>
          <ChartTooltip
            cursor={false}
            content={({ active, payload }: TooltipArgs<(typeof data)[number]>) => {
              const p = active && payload?.[0]?.payload;
              if (!p) return null;
              return <TipCard lines={[{ color: p.color, name: p.label, value: `${fmt.money(p.value)} · ${fmt.percent(p.value / total)}` }]} />;
            }}
          />
          <Pie
            data={data}
            dataKey="value"
            nameKey="label"
            innerRadius={66}
            outerRadius={96}
            paddingAngle={segments.length > 1 ? 1.2 : 0}
            cornerRadius={4}
            stroke="var(--card)"
            strokeWidth={2}
            onMouseEnter={(_, i) => setHover(segments[i]?.key ?? null)}
            onMouseLeave={() => setHover(null)}
            onClick={(_, i) => segments[i] && onSelect?.(segments[i].key)}
          >
            <Label
              content={({ viewBox }) => {
                if (!viewBox || !("cx" in viewBox)) return null;
                const { cx = 0, cy = 0 } = viewBox as { cx?: number; cy?: number };
                return (
                  <text x={cx} y={cy} textAnchor="middle" dominantBaseline="middle">
                    <tspan x={cx} y={cy - 12} className="fill-muted-foreground text-[12px]">
                      {focused ? focused.label : centerLabel}
                    </tspan>
                    <tspan x={cx} y={cy + 12} className="fill-foreground text-[20px] font-semibold">
                      {fmt.moneyCompact(focused ? focused.value : total)}
                    </tspan>
                  </text>
                );
              }}
            />
          </Pie>
        </PieChart>
      </ChartContainer>

      <ul className="w-full min-w-0 space-y-0.5">
        {segments.map((s) => (
          <li key={s.key}>
            <button
              type="button"
              onPointerEnter={() => setHover(s.key)}
              onPointerLeave={() => setHover(null)}
              onFocus={() => setHover(s.key)}
              onBlur={() => setHover(null)}
              onClick={() => onSelect?.(s.key)}
              aria-pressed={selected === s.key}
              className={cn(
                "flex w-full items-center gap-2.5 rounded-lg px-2 py-1.5 text-left text-[13px] transition-colors hover:bg-muted",
                selected === s.key && "bg-muted",
              )}
            >
              <span className="size-2.5 shrink-0 rounded-[3px]" style={{ background: s.color }} aria-hidden />
              <span className="min-w-0 flex-1 truncate text-foreground">{s.label}</span>
              <span className="shrink-0 font-medium tabular-nums text-foreground">{fmt.money(s.value)}</span>
              <span className="w-9 shrink-0 text-right text-[12px] tabular-nums text-muted-foreground">{total ? fmt.percent(s.value / total) : "—"}</span>
            </button>
          </li>
        ))}
      </ul>
    </div>
    </div>
  );
}
