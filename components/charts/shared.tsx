"use client";

import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/** Round, readable axis steps: 0 / 5K / 10K / 15K … */
export function niceTicks(max: number, target = 4) {
  if (!(max > 0)) return { ticks: [0], top: 1 };
  const raw = max / target;
  const mag = 10 ** Math.floor(Math.log10(raw));
  const norm = raw / mag;
  const step = (norm <= 1 ? 1 : norm <= 2 ? 2 : norm <= 2.5 ? 2.5 : norm <= 5 ? 5 : 10) * mag;
  const top = Math.ceil(max / step) * step;
  const ticks: number[] = [];
  for (let t = 0; t <= top + step / 2; t += step) ticks.push(Math.round(t));
  return { ticks, top };
}

export interface TipLine {
  color: string;
  name: string;
  value: string;
  muted?: boolean;
}

/** Tooltip card in the shadcn chart style. The value leads; a short stroke of the series colour keys each row. */
export function TipCard({ title, lines, note, className }: { title?: ReactNode; lines: TipLine[]; note?: ReactNode; className?: string }) {
  return (
    <div className={cn("grid min-w-36 gap-1.5 rounded-lg border border-border bg-popover px-3 py-2 text-xs shadow-xl", className)}>
      {title && <div className="font-medium text-muted-foreground">{title}</div>}
      {lines.map((l, i) => (
        <div key={`${i}-${l.name}`} className="flex items-center gap-2">
          <span className="h-0.5 w-3 shrink-0 rounded-full" style={{ background: l.color }} aria-hidden />
          <span className={cn("font-semibold tabular-nums", l.muted ? "text-muted-foreground" : "text-foreground")}>{l.value}</span>
          <span className="truncate text-muted-foreground">{l.name}</span>
        </div>
      ))}
      {note && <div className="text-muted-foreground">{note}</div>}
    </div>
  );
}

/** Legend entry: rect key for bars/areas, line key for lines. */
export function LegendItem({ color, label, shape = "rect" }: { color: string; label: ReactNode; shape?: "rect" | "line" | "dash" }) {
  return (
    <span className="inline-flex items-center gap-1.5 text-[12px]">
      {shape === "rect" ? (
        <span className="size-2.5 rounded-[3px]" style={{ background: color }} aria-hidden />
      ) : (
        <svg width="14" height="4" aria-hidden>
          <line x1="1" x2="13" y1="2" y2="2" stroke={color} strokeWidth="2" strokeLinecap="round" strokeDasharray={shape === "dash" ? "3 3" : undefined} />
        </svg>
      )}
      {label}
    </span>
  );
}

/** Recharts passes these to custom tooltip content. Kept loose on purpose. */
export interface TooltipArgs<T> {
  active?: boolean;
  payload?: readonly { payload?: T }[];
}

/** Props Recharts hands to a custom axis tick. */
export interface TickArgs {
  x?: number | string;
  y?: number | string;
  payload?: { value?: unknown };
}
