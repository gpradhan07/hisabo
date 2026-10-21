"use client";

import { Eye, EyeOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useDashboard } from "./data-provider";

/** Eye button in the top bar: amounts are hidden (₹ ••••) until you tap it. */
export function PrivacyToggle({ className, onBrand = false }: { className?: string; onBrand?: boolean }) {
  const { amountsHidden, toggleAmounts } = useDashboard();
  const label = amountsHidden ? "Show amounts" : "Hide amounts";

  return (
    <Button
      variant="ghost"
      size="icon"
      onClick={() => toggleAmounts()}
      aria-label={label}
      aria-pressed={!amountsHidden}
      title={label}
      className={cn(onBrand && "text-white/80 hover:bg-white/10 hover:text-white", className)}
    >
      {/* keyed so the new icon fades in on every switch */}
      <span key={String(amountsHidden)} className="grid place-items-center duration-200 animate-in fade-in">
        {amountsHidden ? <Eye /> : <EyeOff />}
      </span>
    </Button>
  );
}
