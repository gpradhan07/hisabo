import { addMonths, daysBetween, startOfDay } from "./dates";
import type { Profile } from "./types";

export type ProfileInput = Partial<Record<keyof Profile, string | number | null | undefined>>;
export type ProfileErrors = Partial<Record<keyof Profile, string>>;

const num = (v: unknown) => {
  if (v === null || v === undefined || v === "") return undefined;
  const n = typeof v === "number" ? v : Number(String(v).replace(/[^0-9.\-]/g, ""));
  return Number.isFinite(n) ? n : NaN;
};

/** Checks user input. Name is required; everything else is optional. */
export function validateProfile(input: ProfileInput): { ok: true; profile: Profile } | { ok: false; errors: ProfileErrors } {
  const errors: ProfileErrors = {};
  const name = String(input.name ?? "").trim().replace(/\s+/g, " ");
  const email = String(input.email ?? "").trim();
  const monthlyIncome = num(input.monthlyIncome);
  const monthlyBudget = num(input.monthlyBudget);
  const payday = num(input.payday);

  if (!name) errors.name = "Please enter your name.";
  else if (name.length > 60) errors.name = "Keep it under 60 characters.";
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) errors.email = "That email doesn't look right.";
  if (monthlyIncome !== undefined && !(monthlyIncome > 0)) errors.monthlyIncome = "Enter an amount above 0.";
  if (monthlyBudget !== undefined && !(monthlyBudget > 0)) errors.monthlyBudget = "Enter an amount above 0.";
  if (payday !== undefined && !(Number.isInteger(payday) && payday >= 1 && payday <= 31)) errors.payday = "Use a day from 1 to 31.";

  if (Object.keys(errors).length) return { ok: false, errors };
  return {
    ok: true,
    profile: {
      name,
      ...(email ? { email } : {}),
      ...(monthlyIncome ? { monthlyIncome } : {}),
      ...(monthlyBudget ? { monthlyBudget } : {}),
      ...(payday ? { payday } : {}),
    },
  };
}

/** Accepts whatever the sheet sends back; drops anything unusable. */
export function normalizeProfile(raw: unknown): Profile | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  const v = validateProfile({
    name: r.name as string,
    email: r.email as string,
    monthlyIncome: r.monthlyIncome as number,
    monthlyBudget: r.monthlyBudget as number,
    payday: r.payday as number,
  });
  if (v.ok) return v.profile;
  // Keep the valid parts if someone typed something odd into the sheet by hand.
  const name = String(r.name ?? "").trim();
  return name ? { name: name.slice(0, 60) } : null;
}

export const firstName = (name: string) => name.trim().split(/\s+/)[0] ?? "";

/** First letter of the name, for the avatar ("Gourav" → "G"). */
export const initial = (name: string) => name.trim().charAt(0).toUpperCase() || "?";

export function greeting(now: Date) {
  const h = now.getHours();
  return h < 5 ? "Hello" : h < 12 ? "Good morning" : h < 17 ? "Good afternoon" : "Good evening";
}

/** Days until the next payday (0 = today). Short months use their last day. */
export function daysToPayday(payday: number, now: Date) {
  const today = startOfDay(now);
  const on = (monthStart: Date) => {
    const last = new Date(monthStart.getFullYear(), monthStart.getMonth() + 1, 0).getDate();
    return new Date(monthStart.getFullYear(), monthStart.getMonth(), Math.min(payday, last));
  };
  const thisMonth = on(new Date(today.getFullYear(), today.getMonth(), 1));
  const next = thisMonth >= today ? thisMonth : on(addMonths(new Date(today.getFullYear(), today.getMonth(), 1), 1));
  return daysBetween(today, next);
}
