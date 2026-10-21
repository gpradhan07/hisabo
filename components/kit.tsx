"use client";

import { ArrowDownRight, ArrowRight, ArrowUpRight } from "lucide-react";
import type { ReactNode } from "react";
import { Badge as UiBadge } from "@/components/ui/badge";
import { Card as UiCard, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton as UiSkeleton } from "@/components/ui/skeleton";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { cn } from "@/lib/utils";

export const cx = cn;

/** shadcn Card with the header layout every dashboard panel uses. */
/** Elevation is declared once: a hairline ring, no shadow. */
export function Card({
  title,
  subtitle,
  action,
  className,
  contentClassName,
  children,
}: {
  title?: ReactNode;
  subtitle?: ReactNode;
  action?: ReactNode;
  className?: string;
  contentClassName?: string;
  children: ReactNode;
}) {
  return (
    <UiCard className={cn("min-w-0 gap-5 rounded-xl py-5 ring-border sm:py-6", className)}>
      {(title || action) && (
        <CardHeader className="px-5 sm:px-6">
          <div className="min-w-0">
            {title && <CardTitle className="text-[15px] font-semibold tracking-tight">{title}</CardTitle>}
            {subtitle && <CardDescription className="mt-1 text-[13px]">{subtitle}</CardDescription>}
          </div>
          {action && <CardAction>{action}</CardAction>}
        </CardHeader>
      )}
      <CardContent className={cn("flex flex-1 flex-col px-5 sm:px-6", contentClassName)}>{children}</CardContent>
    </UiCard>
  );
}

/** A list row's icon, coloured by tone. No tile behind it: the colour carries the meaning. */
export function ToneIcon({ children, tone = "brand" }: { children: ReactNode; tone?: "brand" | "good" | "bad" | "warn" | "neutral" }) {
  return (
    <span
      className={cn(
        "mt-0.5 shrink-0",
        tone === "brand" && "text-brand-ink",
        tone === "good" && "text-good",
        tone === "bad" && "text-bad",
        tone === "warn" && "text-warn",
        tone === "neutral" && "text-muted-foreground",
      )}
      aria-hidden
    >
      {children}
    </span>
  );
}

/** Period filter / view switch, built on shadcn ToggleGroup. `stretch` fills the row on phones. */
export function Segmented<T extends string>({
  value,
  onChange,
  options,
  label,
  size = "md",
  stretch = false,
}: {
  value: T;
  onChange: (v: T) => void;
  options: { value: T; label: ReactNode; title?: string }[];
  label: string;
  size?: "sm" | "md";
  stretch?: boolean;
}) {
  return (
    <ToggleGroup
      type="single"
      variant="outline"
      size={size === "sm" ? "sm" : "default"}
      value={value}
      onValueChange={(v) => v && onChange(v as T)}
      aria-label={label}
      className={cn("shrink-0 bg-card", stretch && "w-full sm:w-auto")}
    >
      {options.map((o) => (
        <ToggleGroupItem
          key={o.value}
          value={o.value}
          aria-label={o.title ?? (typeof o.label === "string" ? o.label : undefined)}
          title={o.title}
          className={cn(
            "data-[state=on]:bg-primary data-[state=on]:text-primary-foreground",
            size === "sm" ? "px-2.5 text-[12px]" : "px-3.5 text-[13px]",
            stretch && "flex-1 px-1 text-[12px] sm:flex-none sm:px-3.5 sm:text-[13px]",
          )}
        >
          {o.label}
        </ToggleGroupItem>
      ))}
    </ToggleGroup>
  );
}

/** Change vs a previous period. For spending, up is bad. Icon + sign carry it; colour only reinforces. */
export function Delta({ change, label, onBrand = false }: { change: number | null; label?: string; onBrand?: boolean }) {
  if (change === null || !Number.isFinite(change)) {
    return <span className={cn("text-[13px]", onBrand ? "text-white/70" : "text-muted-foreground")}>No earlier data to compare</span>;
  }
  const up = change > 0.005;
  const down = change < -0.005;
  return (
    <span className="inline-flex flex-wrap items-center gap-x-2 gap-y-1 text-[13px]">
      <TrendBadge change={change} onBrand={onBrand} />
      {label && <span className={onBrand ? "text-white/80" : "text-muted-foreground"}>{label}</span>}
      <span className="sr-only">{up ? "more" : down ? "less" : "no change"}</span>
    </span>
  );
}

/** `upIsGood` flips the colours for things you want more of (like investing). */
export function TrendBadge({ change, onBrand = false, upIsGood = false }: { change: number; onBrand?: boolean; upIsGood?: boolean }) {
  const up = change > 0.005;
  const down = change < -0.005;
  const bad = upIsGood ? down : up;
  const good = upIsGood ? up : down;
  const Icon = up ? ArrowUpRight : down ? ArrowDownRight : ArrowRight;
  return (
    <UiBadge
      variant="outline"
      className={cn(
        "gap-0.5 rounded-full px-2 font-semibold",
        onBrand ? "border-white/20 bg-white/12 text-white" : bad ? "border-bad/30 bg-bad-soft text-bad" : good ? "border-good/30 bg-good-soft text-good" : "",
      )}
    >
      <Icon className="size-3.5" strokeWidth={2.5} aria-hidden />
      {up ? "+" : down ? "−" : ""}
      {Math.round(Math.abs(change) * 100)}%
    </UiBadge>
  );
}

/**
 * A big amount with its paise a size smaller: ₹40,638.00 → ₹40,638 + ".00".
 * Keeps long figures fitting on phones. Anything else (counts, "₹••••", ₹1.2K) passes through as is.
 */
export function Amount({ text }: { text: string }) {
  const m = /^(.*\d)([.,]\d{2})$/.exec(text);
  if (!m) return text;
  return (
    <>
      {m[1]}
      <span className="text-[0.62em] opacity-75">{m[2]}</span>
    </>
  );
}

/**
 * A row of key figures in one card, split by hairlines: two per row on phones, four from `lg`.
 * (The hairlines are the line colour showing through a 1px gap.)
 */
export function StatGrid({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn("grid min-w-0 grid-cols-2 gap-px overflow-hidden rounded-xl bg-line ring-1 ring-border lg:grid-cols-4", className)}>{children}</div>;
}

/** One figure in a StatGrid: label (with an optional badge beside it), big value, footer lines. */
export function StatTile({
  label,
  value,
  sub,
  badge,
  footer,
  chart,
  className,
}: {
  label: string;
  value: ReactNode;
  sub?: ReactNode;
  badge?: ReactNode;
  footer?: ReactNode;
  chart?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("@container/stat flex min-w-0 flex-col bg-card px-4 py-4 sm:px-5 sm:py-5", className)}>
      {/* the badge sits beside the label only, so the value always gets the full width */}
      <div className="flex min-w-0 items-center justify-between gap-2">
        <p className="truncate text-[12px] font-medium text-muted-foreground sm:text-[13px]">{label}</p>
        {badge && <div className="shrink-0">{badge}</div>}
      </div>
      <p className="mt-1 truncate text-[20px] font-semibold tracking-tight @[220px]/stat:text-[28px]">
        {typeof value === "string" ? <Amount text={value} /> : value}
      </p>
      {(sub || chart || footer) && (
        <div className="mt-auto flex items-end justify-between gap-3 pt-3">
          <div className="min-w-0 text-[12px]">
            {footer && <div className="line-clamp-1 font-medium text-foreground">{footer}</div>}
            {sub && <div className="truncate text-muted-foreground">{sub}</div>}
          </div>
          {chart && <div className="hidden shrink-0 @[240px]/stat:block">{chart}</div>}
        </div>
      )}
    </div>
  );
}

export function Badge({ tone = "neutral", children }: { tone?: "good" | "bad" | "warn" | "brand" | "neutral"; children: ReactNode }) {
  return (
    <UiBadge
      variant="outline"
      className={cn(
        "gap-1 rounded-full font-semibold",
        tone === "good" && "border-good/30 bg-good-soft text-good",
        tone === "bad" && "border-bad/30 bg-bad-soft text-bad",
        tone === "warn" && "border-warn/30 bg-warn-soft text-warn",
        tone === "brand" && "border-brand/30 bg-brand-soft text-brand-ink",
        tone === "neutral" && "text-muted-foreground",
      )}
    >
      {children}
    </UiBadge>
  );
}

export function EmptyState({ icon, title, body }: { icon: ReactNode; title: string; body?: ReactNode }) {
  return (
    <div className="flex flex-1 flex-col items-center justify-center px-4 py-10 text-center">
      <span className="mb-2.5 text-muted-foreground" aria-hidden>
        {icon}
      </span>
      <p className="text-[14px] font-medium text-foreground">{title}</p>
      {body && <p className="mt-1 max-w-xs text-[13px] text-muted-foreground">{body}</p>}
    </div>
  );
}

export function Skeleton({ className }: { className?: string }) {
  return <UiSkeleton className={cn("rounded-xl", className)} />;
}

/** Heading for a group of cards, with an optional note on what scopes the group. */
export function SectionHeading({ children, hint }: { children: ReactNode; hint?: ReactNode }) {
  return (
    <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5 pt-4">
      <h2 className="text-[18px] font-semibold tracking-tight text-foreground">{children}</h2>
      {hint && <p className="text-[13px] text-muted-foreground">{hint}</p>}
    </div>
  );
}
