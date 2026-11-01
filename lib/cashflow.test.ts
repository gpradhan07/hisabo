import { describe, expect, it } from "vitest";
import { dayToDay, isFixed, paydayCycle, tillPayday, upcomingPayments } from "./cashflow";
import type { Emi, EmiPayment, Expense, Investment, Subscription } from "./types";

const at = (y: number, m: number, d: number, h = 10) => new Date(y, m - 1, d, h);
const expense = (amount: number, category: string, date: Date): Expense => ({ id: `${category}${amount}`, date, amount, category, remark: "" });
const emi = (over: Partial<Emi> = {}): Emi => ({
  id: "m1", name: "iPhone", monthly: 5000, tenure: 12, total: 60000, startDate: at(2026, 10, 5, 0), addedOn: null, type: "", paidBefore: 0, remark: "", ...over,
});
const sub = (over: Partial<Subscription> = {}): Subscription => ({
  id: "s1", date: at(2026, 10, 15), amount: 649, name: "Netflix", frequency: "Monthly", autoRenew: true, paymentMethod: "", cardName: "", remark: "", ...over,
});
const sip = (over: Partial<Investment> = {}): Investment => ({
  id: "i1", date: at(2026, 10, 20), amount: 5000, type: "SIP", frequency: "Monthly", paymentMethod: "", remark: "", name: "Nifty 50", platform: "", cardName: "", ...over,
});

describe("rent and subscriptions vs day-to-day", () => {
  it("treats rent and subscriptions as fixed, whatever the capitals", () => {
    const list = [expense(18000, "Rent", at(2026, 11, 1)), expense(649, "subscriptions", at(2026, 11, 2)), expense(250, "Food & Dining", at(2026, 11, 2))];
    expect(list.map(isFixed)).toEqual([true, true, false]);
    expect(dayToDay(list).map((e) => e.amount)).toEqual([250]);
  });
});

describe("paydayCycle", () => {
  it("runs from the last payday to the next", () => {
    expect(paydayCycle(1, at(2026, 11, 2))).toEqual({ start: at(2026, 11, 1, 0), end: at(2026, 12, 1, 0), daysLeft: 29 });
    expect(paydayCycle(25, at(2026, 11, 2))).toEqual({ start: at(2026, 10, 25, 0), end: at(2026, 11, 25, 0), daysLeft: 23 });
  });

  it("starts a new cycle on payday itself", () => {
    expect(paydayCycle(10, at(2026, 11, 10, 18)).start).toEqual(at(2026, 11, 10, 0));
  });

  it("pays on the last day of a short month", () => {
    expect(paydayCycle(31, at(2027, 2, 10)).start).toEqual(at(2027, 1, 31, 0));
    expect(paydayCycle(31, at(2027, 2, 10)).end).toEqual(at(2027, 2, 28, 0));
  });
});

describe("upcomingPayments", () => {
  const now = at(2026, 11, 2);
  const until = at(2026, 12, 2, 0);

  it("lists EMIs, renewals and SIPs due before `until`, soonest first", () => {
    const list = upcomingPayments({ emis: [emi()], subscriptions: [sub()], investments: [sip()], now, until });
    expect(list.map((u) => [u.kind, u.name, u.date.getDate(), u.amount, u.detail])).toEqual([
      ["emi", "iPhone", 5, 5000, "Instalment 2 of 12"],
      ["subscription", "Netflix", 15, 649, "Monthly"],
      ["investment", "Nifty 50", 20, 5000, "Monthly"],
    ]);
  });

  it("skips EMI instalments already recorded as paid", () => {
    const paid: EmiPayment[] = [1, 2].map((n) => ({ id: `p${n}`, date: at(2026, 9 + n, 5), emiName: "iPhone", amount: 5000, paymentMethod: "", cardName: "", remark: "" }));
    expect(upcomingPayments({ emis: [emi()], emiPayments: paid, now, until }).map((u) => u.detail)).toEqual([]);
  });

  it("leaves out subscriptions that won't renew", () => {
    expect(upcomingPayments({ subscriptions: [sub({ autoRenew: false })], now, until })).toEqual([]);
  });
});

describe("tillPayday", () => {
  it("is income minus spent, invested and bills still due this cycle", () => {
    const now = at(2026, 11, 10);
    const res = tillPayday({
      income: 90000,
      payday: 1,
      expenses: [expense(18000, "Rent", at(2026, 11, 1)), expense(2000, "Food & Dining", at(2026, 11, 6)), expense(999, "Food & Dining", at(2026, 10, 30))],
      emis: [emi()],
      subscriptions: [sub()],
      investments: [sip(), sip({ id: "i2", date: at(2026, 11, 3), name: "Gold", frequency: "One-time", amount: 1000 })],
      now,
    });
    // 90,000 − 20,000 spent − 1,000 invested − (5,000 EMI + 649 Netflix + 5,000 SIP still due)
    expect(res).toMatchObject({ spent: 20000, invested: 1000, committed: 10649, left: 58351, daysLeft: 21 });
    expect(res.perDay).toBeCloseTo(58351 / 21);
  });
});
