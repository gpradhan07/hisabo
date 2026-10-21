"use client";

import { createElement } from "react";
import { categoryIcon } from "@/lib/categories";
import { slotColor } from "./use-period-data";

/** Category icon on a tint of the category's colour; the icon stays in ink so it's always legible. */
export function CategoryAvatar({ category, slots, size = 36 }: { category: string; slots: Map<string, number>; size?: number }) {
  return (
    <span
      className="grid shrink-0 place-items-center rounded-xl text-ink"
      style={{ width: size, height: size, background: `color-mix(in oklab, ${slotColor(slots, category)} 22%, var(--surface))` }}
      aria-hidden
    >
      {createElement(categoryIcon(category), { size: Math.round(size * 0.45) })}
    </span>
  );
}
