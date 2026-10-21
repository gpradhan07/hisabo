"use client";

import { ArrowDownRight, ArrowUpRight, Car, Clapperboard, ShoppingBag, ShoppingBasket, UtensilsCrossed, type LucideIcon } from "lucide-react";
import { useEffect, useState, type CSSProperties, type ReactNode } from "react";
import { cn } from "@/lib/utils";

type Item = {
  merchant: string;
  category: string;
  icon: LucideIcon;
  /** the expense that just synced */
  amount: number;
  /** the category's total this month */
  total: number;
  /** last 12 months, oldest first (relative heights, %) */
  bars: number[];
};

/** A made-up feed: every few seconds the next expense "syncs" and the card switches to its category. */
const FEED: Item[] = [
  { merchant: "Zomato", category: "Food", icon: UtensilsCrossed, amount: 420, total: 8640, bars: [52, 60, 48, 66, 58, 70, 62, 74, 64, 80, 68, 58] },
  { merchant: "Uber", category: "Transport", icon: Car, amount: 286, total: 3120, bars: [30, 34, 40, 36, 44, 38, 46, 42, 50, 40, 38, 46] },
  { merchant: "BigBasket", category: "Groceries", icon: ShoppingBasket, amount: 1240, total: 9870, bars: [64, 58, 70, 62, 74, 68, 60, 72, 66, 78, 70, 66] },
  { merchant: "Amazon", category: "Shopping", icon: ShoppingBag, amount: 1899, total: 6450, bars: [24, 40, 30, 56, 34, 46, 38, 84, 42, 50, 52, 62] },
  { merchant: "Netflix", category: "Entertainment", icon: Clapperboard, amount: 649, total: 1980, bars: [20, 22, 26, 22, 30, 24, 28, 32, 26, 30, 28, 30] },
];
const MONTHS = ["J", "F", "M", "A", "M", "J", "J", "A", "S", "O", "N", "D"];
const EVERY = 3200;

const inr = new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", minimumFractionDigits: 2, maximumFractionDigits: 2 });

/** ₹8,640 with a smaller ".00" */
function Rupees({ value, paise }: { value: number; paise: string }) {
  const text = inr.format(value);
  const dot = text.lastIndexOf(".");
  return (
    <>
      {text.slice(0, dot)}
      <span className={cn(paise, "opacity-70")}>{text.slice(dot)}</span>
    </>
  );
}

/**
 * Shows one child at a time. All children share one grid cell (so nothing jumps in size);
 * the current one slides up into place while the previous one slides up and out.
 */
function Swap({ index, children, className }: { index: number; children: ReactNode[]; className?: string }) {
  const prev = (index - 1 + children.length) % children.length;
  return (
    <span className={cn("grid", className)}>
      {children.map((child, i) => (
        <span key={i} className="swap-item" data-state={i === index ? "on" : i === prev ? "off" : "next"}>
          {child}
        </span>
      ))}
    </span>
  );
}

/** Decorative product preview on the sign-in page: a card that follows a live feed of expenses. */
export function LivePreview() {
  const [index, setIndex] = useState(0);
  const [grown, setGrown] = useState(false);

  useEffect(() => {
    // bars grow in once the page has painted, then the feed starts ticking
    const raf = requestAnimationFrame(() => setGrown(true));
    const timer = setInterval(() => {
      if (!document.hidden) setIndex((i) => (i + 1) % FEED.length);
    }, EVERY);
    return () => {
      cancelAnimationFrame(raf);
      clearInterval(timer);
    };
  }, []);

  const item = FEED[index];
  const changeOf = (it: Item) => Math.round(((it.bars[11] - it.bars[10]) / it.bars[10]) * 100);

  return (
    <div className="relative mt-14" aria-hidden>
      <div className="login-card rounded-xl p-5">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <div className="flex items-center gap-2 text-[12px] text-white/60">
              <Swap index={index}>{FEED.map((it) => `${it.category} this month`)}</Swap>
              <span className="rounded-full border border-white/15 px-1.5 text-[11px] leading-4 text-white/70">Sample</span>
            </div>
            <Swap index={index} className="mt-0.5 text-[28px] font-semibold tracking-tight">
              {FEED.map((it) => (
                <Rupees key={it.merchant} value={it.total} paise="text-[0.62em]" />
              ))}
            </Swap>
          </div>
          <Swap index={index} className="justify-items-end">
            {FEED.map((it) => {
              const change = changeOf(it);
              return (
                <span
                  key={it.merchant}
                  className={cn(
                    "inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-[12px] font-semibold whitespace-nowrap",
                    change > 0 ? "border-[#f4b56c]/25 bg-[#f4b56c]/10 text-[#f6c78f]" : "border-[#48d6a0]/25 bg-[#48d6a0]/10 text-[#7fe6bd]",
                  )}
                >
                  {change > 0 ? <ArrowUpRight className="size-3.5" strokeWidth={2.5} /> : <ArrowDownRight className="size-3.5" strokeWidth={2.5} />}
                  {Math.abs(change)}% vs last month
                </span>
              );
            })}
          </Swap>
        </div>

        <div className="mt-5 flex h-24 items-end gap-2 [contain:layout_paint]">
          {item.bars.map((h, i) => (
            <div
              key={i}
              className={i === 11 ? "login-bar login-bar-now" : "login-bar"}
              style={{ height: `${grown ? h : 0}%`, "--i": i } as CSSProperties}
            />
          ))}
        </div>
        <div className="mt-2 flex gap-2 text-center text-[11px] text-white/60">
          {MONTHS.map((m, i) => (
            <span key={i} className="flex-1">
              {m}
            </span>
          ))}
        </div>
      </div>

      {/* the expense that just synced */}
      <div className="login-toast-in absolute -top-9 -right-6">
        <Swap index={index} className="justify-items-end">
          {FEED.map((it) => (
            <span key={it.merchant} className="login-toast flex items-center gap-3 rounded-xl px-3.5 py-2.5">
              <span className="grid size-8 place-items-center rounded-lg bg-[#48d6a0]/15 text-[#48d6a0]">
                <it.icon size={15} />
              </span>
              <span className="leading-tight">
                <span className="block text-[13px] font-medium">{it.merchant}</span>
                <span className="block text-[11px] text-white/50">{it.category} · just now</span>
              </span>
              <span className="ml-4 text-[14px] font-semibold">
                <Rupees value={it.amount} paise="text-[0.75em]" />
              </span>
            </span>
          ))}
        </Swap>
      </div>
    </div>
  );
}
