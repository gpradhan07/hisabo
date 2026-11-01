import { describe, expect, it } from "vitest";
import { investmentPlans, withAutoInstalments } from "./investments";
import type { Investment } from "./types";

const at = (m: number, d: number) => new Date(2026, m - 1, d, 10);
const sip = (date: Date, amount = 5000, extra: Partial<Investment> = {}): Investment => ({
  id: `i${date.getTime()}`,
  date,
  amount,
  type: "Mutual Fund",
  frequency: "Monthly",
  paymentMethod: "UPI",
  remark: "",
  name: "Nifty 50",
  platform: "Groww",
  cardName: "",
  ...extra,
});
const now = at(11, 2);
const months = (list: Investment[]) => list.map((i) => `${i.date.getMonth() + 1}/${i.date.getDate()}:${i.amount}${i.auto ? "a" : ""}`).reverse();

describe("withAutoInstalments", () => {
  it("counts a SIP added once in August every month until today", () => {
    const list = withAutoInstalments([sip(at(8, 1))], now);
    expect(months(list)).toEqual(["8/1:5000", "9/1:5000a", "10/1:5000a", "11/1:5000a"]);
    expect(list.reduce((s, i) => s + i.amount, 0)).toBe(20000);
  });

  it("lets a logged month (same name and amount) take the automatic one's place, even a few days off", () => {
    const list = withAutoInstalments([sip(at(8, 5)), sip(at(10, 2))], now);
    expect(months(list)).toEqual(["8/5:5000", "9/5:5000a", "10/2:5000"]);
  });

  it("makes a same-name entry with another amount a plan of its own, numbered", () => {
    const list = withAutoInstalments([sip(at(9, 1)), sip(at(10, 1), 6000)], now);
    expect(months(list).sort()).toEqual(["10/1:5000a", "10/1:6000", "11/1:5000a", "11/1:6000a", "9/1:5000"]);
    expect(list.find((i) => i.amount === 6000)!.planName).toBe("Nifty 50 2");
    expect(list.find((i) => i.amount === 5000)!.planName).toBe("Nifty 50");
  });

  it("keeps the same numbering when run again on its own output", () => {
    const once = withAutoInstalments([sip(at(9, 1), 5000, { id: "i2" }), sip(at(10, 1), 6000, { id: "i3" })], now);
    expect(withAutoInstalments(once, now).map((i) => i.planName)).toEqual(once.map((i) => i.planName));
    expect(investmentPlans(once, now).map((p) => p.name)).toEqual(["Nifty 50", "Nifty 50 2"]);
  });

  it("makes a second deposit in a month already logged a plan of its own", () => {
    const list = withAutoInstalments([sip(at(10, 1), 5000, { id: "i2" }), sip(at(10, 1), 5000, { id: "i3" })], now);
    expect(list.map((i) => i.planName).sort()).toEqual(["Nifty 50", "Nifty 50", "Nifty 50 2", "Nifty 50 2"]);
  });

  it("counts the user's two Post office deposits separately", () => {
    const po = (date: Date, amount: number, remark: string) => sip(date, amount, { type: "Others", name: "Post office", platform: "To Dad", remark });
    const list = withAutoInstalments([po(new Date(2024, 1, 2, 1, 55), 2000, "Added Post office 1"), po(new Date(2025, 4, 2, 1, 57), 3000, "Added Post office 2")], now);
    const total = (name: string) => list.filter((i) => i.planName === name).reduce((s, i) => s + i.amount, 0);
    expect(total("Post office")).toBe(34 * 2000);
    expect(total("Post office 2")).toBe(19 * 3000);
  });

  it("stops counting from the stop date, and starts again from a new entry", () => {
    const stopped = [sip(at(6, 1), 5000, { stoppedOn: at(8, 15) })];
    expect(months(withAutoInstalments(stopped, now))).toEqual(["6/1:5000", "7/1:5000a", "8/1:5000a"]);
    const restarted = [...stopped, sip(at(10, 10), 4000)];
    expect(months(withAutoInstalments(restarted, now))).toEqual(["6/1:5000", "7/1:5000a", "8/1:5000a", "10/10:4000"]);
  });

  it("leaves one-time investments alone, and doesn't double up when run twice", () => {
    const list = [sip(at(8, 1)), sip(at(9, 3), 12000, { frequency: "One-time", name: "Infosys", type: "Stocks" })];
    const once = withAutoInstalments(list, now);
    expect(once.filter((i) => i.auto)).toHaveLength(3);
    expect(withAutoInstalments(once, now)).toHaveLength(once.length);
  });
});

describe("investmentPlans", () => {
  it("keeps a plan running (never 'paused' for missed logging) with the next date to come", () => {
    const [plan] = investmentPlans([sip(at(8, 5))], now);
    expect(plan).toMatchObject({ active: true, count: 3, autoCount: 2, total: 15000, stoppedOn: null });
    expect(plan.next).toEqual(new Date(2026, 10, 5));
  });

  it("skips a month already logged early when saying what's next", () => {
    const [plan] = investmentPlans([sip(at(8, 5)), sip(at(11, 1))], now);
    expect(plan.next).toEqual(new Date(2026, 11, 5));
  });

  it("lists numbered plans separately, each with its own amount", () => {
    const plans = investmentPlans([sip(at(9, 1)), sip(at(10, 1), 6000)], now);
    expect(plans.map((p) => [p.name, p.amount, p.count])).toEqual([
      ["Nifty 50", 5000, 3],
      ["Nifty 50 2", 6000, 2],
    ]);
  });

  it("shows a stopped plan as stopped", () => {
    const [plan] = investmentPlans([sip(at(8, 5), 5000, { stoppedOn: at(10, 20) })], now);
    expect(plan).toMatchObject({ active: false, count: 3, total: 15000 });
    expect(plan.stoppedOn).toEqual(at(10, 20));
  });
});
