"use client";

import { useState } from "react";
import { addDays, startOfDay, startOfWeek } from "@/lib/dates";
import { fmtDay, fmtMonthShort, type Formatters } from "@/lib/format";
import { useSize } from "@/lib/hooks";
import { TipCard } from "./shared";

const GAP = 3;
const LABEL_W = 30;
const TOP = 18;
const DAYS = ["Mon", "", "Wed", "", "Fri", "", ""];

/** GitHub-style calendar: one cell per day, darker = more spent. Fits as many weeks as the width allows. */
export function CalendarHeatmap({
  totals,
  today,
  maxWeeks = 53,
  fmt,
}: {
  totals: Map<number, { total: number; count: number }>;
  today: Date;
  maxWeeks?: number;
  fmt: Formatters;
}) {
  const [ref, { width }] = useSize<HTMLDivElement>();
  const [hover, setHover] = useState<{ d: Date; x: number; y: number } | null>(null);

  const cell = width ? Math.max(10, Math.min(16, Math.floor((width - LABEL_W) / Math.min(maxWeeks, 26)) - GAP)) : 12;
  const weeks = Math.max(4, Math.min(maxWeeks, Math.floor((width - LABEL_W) / (cell + GAP))));
  const first = addDays(startOfWeek(today), -(weeks - 1) * 7);
  const end = startOfDay(today);

  // Five classes from quantiles of the days that had spending
  const values: number[] = [];
  for (let d = first; d <= end; d = addDays(d, 1)) {
    const v = totals.get(d.getTime())?.total ?? 0;
    if (v > 0) values.push(v);
  }
  values.sort((a, b) => a - b);
  const q = (p: number) => values[Math.min(values.length - 1, Math.floor(p * values.length))] ?? 0;
  const cuts = [q(0.2), q(0.4), q(0.6), q(0.8)];
  const level = (v: number) => (v <= 0 ? 0 : 1 + cuts.filter((c) => v > c).length);

  const svgW = LABEL_W + weeks * (cell + GAP);
  const svgH = TOP + 7 * (cell + GAP);
  const h = hover ? totals.get(hover.d.getTime()) : null;

  return (
    <div>
      <div ref={ref} className="relative w-full select-none">
        {width > 0 && (
          <svg width={svgW} height={svgH} className="block" role="img" aria-label="Daily spending calendar" onPointerLeave={() => setHover(null)}>
            {DAYS.map((d, r) =>
              d ? (
                <text key={r} x={0} y={TOP + r * (cell + GAP) + cell / 2} dy="0.32em" fontSize={10} fill="var(--ink-3)">
                  {d}
                </text>
              ) : null,
            )}
            {Array.from({ length: weeks }, (_, w) => {
              const weekStart = addDays(first, w * 7);
              const x = LABEL_W + w * (cell + GAP);
              const monthStarts = Array.from({ length: 7 }, (_, r) => addDays(weekStart, r)).find((d) => d.getDate() === 1);
              return (
                <g key={w}>
                  {(monthStarts || w === 0) && w < weeks - 1 && (
                    <text x={x} y={10} fontSize={10} fill="var(--ink-3)">
                      {fmtMonthShort(monthStarts ?? weekStart)}
                    </text>
                  )}
                  {Array.from({ length: 7 }, (_, r) => {
                    const d = addDays(weekStart, r);
                    if (d > end) return null;
                    const v = totals.get(d.getTime())?.total ?? 0;
                    const y = TOP + r * (cell + GAP);
                    const isHover = hover?.d.getTime() === d.getTime();
                    return (
                      <rect
                        key={r}
                        x={x}
                        y={y}
                        width={cell}
                        height={cell}
                        rx={3}
                        fill={`var(--heat-${level(v)})`}
                        stroke={isHover ? "var(--ink)" : "none"}
                        strokeWidth={1.5}
                        onPointerEnter={() => setHover({ d, x: x + cell / 2, y })}
                        onPointerDown={() => setHover({ d, x: x + cell / 2, y })}
                      />
                    );
                  })}
                </g>
              );
            })}
          </svg>
        )}
        {hover && (
          <div
            className="pointer-events-none absolute z-20"
            style={hover.x < width / 2 ? { left: hover.x + 12, top: Math.max(0, hover.y - 56) } : { right: Math.max(width, svgW) - hover.x + 12, top: Math.max(0, hover.y - 56) }}
          >
            <TipCard
              title={fmtDay(hover.d)}
              lines={[{ color: "var(--heat-4)", name: h ? `${h.count} ${h.count === 1 ? "expense" : "expenses"}` : "No spending", value: fmt.money(h?.total ?? 0) }]}
            />
          </div>
        )}
      </div>
      <div className="mt-3 flex items-center justify-end gap-1.5 text-[11px] text-ink-3">
        Less
        {[0, 1, 2, 3, 4, 5].map((l) => (
          <span key={l} className="size-2.5 rounded-[3px]" style={{ background: `var(--heat-${l})` }} aria-hidden />
        ))}
        More
      </div>
    </div>
  );
}
