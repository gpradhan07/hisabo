"use client";

import { useId, type ReactNode } from "react";
import { Area, AreaChart, Label, PolarAngleAxis, PolarRadiusAxis, RadialBar, RadialBarChart } from "recharts";
import { ChartContainer, type ChartConfig } from "@/components/ui/chart";

/** Tiny trend for a KPI card (shadcn area chart, no axes). */
export function Sparkline({ values, width = 96, height = 40 }: { values: number[]; width?: number; height?: number }) {
  const gid = useId().replace(/:/g, "");
  if (values.length < 2) return null;
  const data = values.map((v, i) => ({ i, v }));
  // Fixed size (no ResponsiveContainer): the tile may hide it on narrow cards, which would measure 0×0.
  return (
    <div aria-hidden>
      <AreaChart width={width} height={height} data={data} margin={{ top: 4, right: 4, bottom: 2, left: 2 }}>
        <defs>
          <linearGradient id={`spark-${gid}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="var(--brand)" stopOpacity={0.3} />
            <stop offset="100%" stopColor="var(--brand)" stopOpacity={0} />
          </linearGradient>
        </defs>
        <Area dataKey="v" type="monotone" stroke="var(--brand)" strokeWidth={1.75} fill={`url(#spark-${gid})`} dot={false} isAnimationActive={false} />
      </AreaChart>
    </div>
  );
}

/** shadcn radial chart used as a progress ring. Track is the same hue; fill colour carries the state. */
export function RadialProgress({
  value,
  max,
  size = 190,
  thickness = 16,
  color = "var(--brand)",
  children,
}: {
  value: number;
  max: number;
  size?: number;
  thickness?: number;
  color?: string;
  children?: ReactNode;
}) {
  const data = [{ name: "progress", value: Math.min(value, max), fill: color }];
  const config = { value: { label: "Progress", color } } satisfies ChartConfig;
  const outer = size / 2 - 2;
  return (
    <div className="relative shrink-0" style={{ width: size, height: size }}>
      <ChartContainer config={config} className="aspect-square h-full w-full">
        <RadialBarChart data={data} startAngle={90} endAngle={-270} innerRadius={outer - thickness} outerRadius={outer}>
          <PolarAngleAxis type="number" domain={[0, max || 1]} tick={false} axisLine={false} />
          <RadialBar dataKey="value" background={{ fill: "var(--muted)" }} cornerRadius={thickness / 2} isAnimationActive />
          <PolarRadiusAxis tick={false} tickLine={false} axisLine={false}>
            <Label content={() => null} />
          </PolarRadiusAxis>
        </RadialBarChart>
      </ChartContainer>
      {/* the ring has no tooltip or clicks, so its label simply sits on top */}
      <div className="absolute inset-0 flex flex-col items-center justify-center text-center">{children}</div>
    </div>
  );
}

/** Lightweight ring for the EMI cards. */
export function Ring({
  value,
  max,
  size = 84,
  thickness = 9,
  color = "var(--brand)",
  track = "var(--muted)",
  children,
}: {
  value: number;
  max: number;
  size?: number;
  thickness?: number;
  color?: string;
  track?: string;
  children?: ReactNode;
}) {
  const r = (size - thickness) / 2;
  const c = 2 * Math.PI * r;
  const p = max > 0 ? Math.min(1, Math.max(0, value / max)) : 0;
  return (
    <div className="relative shrink-0" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90" aria-hidden>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={track} strokeWidth={thickness} />
        {p > 0 && (
          <circle
            cx={size / 2}
            cy={size / 2}
            r={r}
            fill="none"
            stroke={color}
            strokeWidth={thickness}
            strokeLinecap="round"
            strokeDasharray={`${c * p} ${c}`}
            style={{ transition: "stroke-dasharray 700ms cubic-bezier(.2,.7,.2,1)" }}
          />
        )}
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center text-center">{children}</div>
    </div>
  );
}
