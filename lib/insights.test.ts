import { describe, expect, it } from "vitest";
import { byPaymentMethod } from "./analytics";
import { makeFormatters } from "./format";
import { buildInsights } from "./insights";
import { getRange } from "./periods";
import { priceRise, subscriptionPlans } from "./subscriptions";
import type { Expense, Subscription } from "./types";

const fmt = makeFormatters("INR");
const at = (d: number, h = 10) => new Date(2026, 10, d, h);
const expense = (amount: number, category: string, date: Date, extra: Partial<Expense> = {}): Expense => ({ id: `${category}${amount}${date.getTime()}`, date, amount, category, remark: "", ...extra });

describe("buildInsights", () => {
  const now = at(2, 18);
  const range = getRange("this-month", now, at(1));
  const current = [expense(18000, "Rent", at(1)), expense(1500, "Food & Dining", at(1, 13)), expense(830, "Groceries", at(2))];

  it("never projects a month-end total from rent paid on day 1", () => {
    const list = buildInsights({ range, current, previous: [], emis: [], budget: 40000, fmt, now });
    const budget = list.find((i) => i.kind === "budget")!;
    expect(budget.title).toBe("₹19,670 of your budget left");
    expect(budget.tone).toBe("good");
    expect(list.map((i) => i.title).join(" ")).not.toMatch(/pace|overshoot/i);
  });

  it("warns only when the budget is nearly or fully used", () => {
    const near = buildInsights({ range, current, previous: [], emis: [], budget: 21000, fmt, now }).find((i) => i.kind === "budget")!;
    expect(near.title).toBe("Only ₹670 of your budget left");
    const over = buildInsights({ range, current, previous: [], emis: [], budget: 20000, fmt, now }).find((i) => i.kind === "budget")!;
    expect(over.title).toBe("Over budget");
  });

  it("picks the biggest day-to-day expense, not the rent", () => {
    const biggest = buildInsights({ range, current, previous: [], emis: [], budget: null, fmt, now }).find((i) => i.kind === "biggest")!;
    expect(biggest.title).toBe("Biggest: ₹1,500");
  });
});

describe("byPaymentMethod", () => {
  it("splits card payments per card and puts unrecorded last", () => {
    const rows = byPaymentMethod([
      expense(100, "Food", at(1), { paymentMethod: "UPI (Credit Card)", cardName: "Kotak CC" }),
      expense(300, "Food", at(1), { paymentMethod: "UPI (Credit Card)", cardName: "IDFC CC" }),
      expense(900, "Food", at(1)),
      expense(50, "Food", at(1), { paymentMethod: "Cash" }),
    ]);
    expect(rows.map((r) => [r.label, r.total])).toEqual([
      ["UPI (Credit Card) · IDFC CC", 300],
      ["UPI (Credit Card) · Kotak CC", 100],
      ["Cash", 50],
      ["Not recorded", 900],
    ]);
  });
});

describe("priceRise", () => {
  const sub = (amount: number, d: number): Subscription => ({ id: `s${d}`, date: at(d), amount, name: "Netflix", frequency: "Monthly", autoRenew: true, paymentMethod: "", cardName: "", remark: "" });
  it("flags a rise over ₹1 and 5%, and ignores rounding noise", () => {
    expect(priceRise(subscriptionPlans([sub(649, 2), sub(499, 1)], at(3))[0])).toBe(150);
    expect(priceRise(subscriptionPlans([sub(500, 2), sub(499, 1)], at(3))[0])).toBe(0);
    expect(priceRise(subscriptionPlans([sub(649, 2)], at(3))[0])).toBe(0);
  });
});
