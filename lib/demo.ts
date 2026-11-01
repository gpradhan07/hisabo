import { addDays, addMonths, startOfDay, startOfMonth } from "./dates";
import { subscriptionExpenses } from "./subscriptions";
import type { Dataset, Emi, EmiPayment, Expense, Investment, Subscription } from "./types";

/** Deterministic PRNG so the demo looks the same on every load */
function mulberry32(seed: number) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const PROFILE: { category: string; perDay: number; min: number; max: number; remarks: string[] }[] = [
  {
    category: "Food & Dining",
    perDay: 0.9,
    min: 80,
    max: 650,
    remarks: ["Swiggy", "Zomato", "Lunch with team", "Chai & snacks", "Dinner out", "Breakfast"],
  },
  {
    category: "Groceries",
    perDay: 0.35,
    min: 250,
    max: 2200,
    remarks: ["BigBasket", "DMart", "Vegetables", "Milk & bread"],
  },
  { category: "Quick Delivery", perDay: 0.25, min: 90, max: 900, remarks: ["Blinkit", "Zepto", "Instamart"] },
  { category: "Transport", perDay: 0.55, min: 60, max: 900, remarks: ["Uber", "Ola", "Metro recharge", "Petrol", "Auto"] },
  { category: "Shopping", perDay: 0.12, min: 499, max: 4800, remarks: ["Amazon", "Myntra", "Decathlon", "Gift", "Shoes"] },
  { category: "Entertainment", perDay: 0.08, min: 149, max: 1400, remarks: ["Movie tickets", "Concert", "Bowling", "Game"] },
  { category: "Health & Medical", perDay: 0.06, min: 120, max: 2500, remarks: ["Pharmacy", "Doctor visit", "Lab test"] },
];

const MONTHLY: { category: string; day: number; amount: number; remark: string }[] = [
  { category: "Rent", day: 1, amount: 18000, remark: "House rent" },
  { category: "Mobile & Internet", day: 5, amount: 799, remark: "Airtel postpaid" },
  { category: "Home & Maintenance", day: 8, amount: 1180, remark: "Electricity bill" },
  { category: "Sports", day: 3, amount: 1500, remark: "Gym membership" },
];

const MERCHANTS = new Set(["Swiggy", "Zomato", "BigBasket", "DMart", "Blinkit", "Zepto", "Instamart", "Uber", "Ola", "Amazon", "Myntra", "Decathlon"]);

/** Subscriptions: name, amount, frequency (months between payments, 0 = one-time), months ago it started, day, auto-renew. */
const SUBSCRIPTIONS: [string, number, number, number, number, boolean, string][] = [
  ["Netflix", 649, 1, 14, 10, true, "Credit Card"],
  ["Spotify", 119, 1, 14, 12, true, "UPI"],
  ["iCloud+", 75, 1, 9, 3, true, "Credit Card"],
  ["Amazon Prime", 1499, 12, 5, 18, true, "Credit Card"],
  ["ChatGPT Plus", 1999, 1, 3, 22, false, "Credit Card"],
  ["Udemy course", 499, 0, 2, 8, false, "UPI"],
];

/** How sample expenses were paid, weighted like real UPI-first spending (cards only for UPI on a credit card) */
const PAID_WITH: [string, string][] = [
  ["UPI (Debit Card)", ""],
  ["UPI (Debit Card)", ""],
  ["UPI (Debit Card)", ""],
  ["UPI (Credit Card)", "Kotak CC"],
  ["UPI (Credit Card)", "IDFC CC"],
  ["Cash", ""],
  ["Apple Wallet", ""],
];

export function demoDataset(now = new Date()): Dataset {
  const rand = mulberry32(42);
  const pick = <T>(arr: T[]) => arr[Math.floor(rand() * arr.length)];
  // Its own sequence, so adding payment methods left every other sample value as it was
  const payRand = mulberry32(7);
  const paidWith = () => {
    const [paymentMethod, cardName] = PAID_WITH[Math.floor(payRand() * PAID_WITH.length)];
    return { paymentMethod, ...(cardName ? { cardName } : {}) };
  };
  const expenses: Expense[] = [];
  const first = addMonths(startOfMonth(now), -14);
  const today = startOfDay(now);
  let id = 0;

  for (let d = first; d <= today; d = addDays(d, 1)) {
    const weekend = d.getDay() === 0 || d.getDay() === 6;
    for (const p of PROFILE) {
      let n = 0;
      const rate = p.perDay * (weekend && p.category !== "Transport" ? 1.5 : 1);
      while (rand() < rate / (n + 1)) n++;
      for (let i = 0; i < n; i++) {
        const at = new Date(d.getFullYear(), d.getMonth(), d.getDate(), 8 + Math.floor(rand() * 14), Math.floor(rand() * 60));
        if (at > now) continue;
        const amount = Math.round((p.min + Math.pow(rand(), 2.2) * (p.max - p.min)) / 10) * 10;
        const remark = pick(p.remarks);
        // Brand names are where the money went; the rest are notes.
        expenses.push(
          MERCHANTS.has(remark)
            ? { id: `d${id++}`, date: at, amount, category: p.category, remark: "", merchant: remark, ...paidWith() }
            : { id: `d${id++}`, date: at, amount, category: p.category, remark, ...paidWith() },
        );
      }
    }
    for (const m of MONTHLY) {
      if (d.getDate() === m.day) {
        const at = new Date(d.getFullYear(), d.getMonth(), d.getDate(), 10, 0);
        if (at <= now) expenses.push({ id: `d${id++}`, date: at, amount: m.amount, category: m.category, remark: m.remark, paymentMethod: "UPI (Debit Card)" });
      }
    }
  }
  const subscriptions: Subscription[] = [];
  for (const [name, amount, every, monthsAgo, day, autoRenew, paymentMethod] of SUBSCRIPTIONS) {
    const start = addMonths(startOfMonth(now), -monthsAgo);
    for (let k = 0; ; k += every || 1) {
      const m = addMonths(start, k);
      const at = new Date(m.getFullYear(), m.getMonth(), day, 9, 0);
      if (at > now || (!every && k > 0) || (!autoRenew && every && k >= 3)) break;
      subscriptions.push({
        id: `s${subscriptions.length}`,
        date: at,
        amount,
        name,
        frequency: every === 0 ? "One-time" : every === 12 ? "Yearly" : "Monthly",
        autoRenew,
        paymentMethod,
        cardName: paymentMethod === "Credit Card" ? "IDFC Millennia CC" : "",
        remark: "",
      });
    }
  }
  subscriptions.sort((a, b) => b.date.getTime() - a.date.getTime());
  expenses.push(...subscriptionExpenses(subscriptions));
  expenses.sort((a, b) => b.date.getTime() - a.date.getTime());

  const thisMonth = startOfMonth(now);
  const emi = (name: string, monthly: number, tenure: number, startOffset: number, day: number): Emi => {
    const s = addMonths(thisMonth, startOffset);
    return {
      id: `m${name}`,
      name,
      monthly,
      tenure,
      total: monthly * tenure,
      startDate: new Date(s.getFullYear(), s.getMonth(), day),
      addedOn: addDays(new Date(s.getFullYear(), s.getMonth(), day), -3),
      type: name.includes("Enfield") ? "Bank Loan" : "Credit Card EMI",
      paidBefore: 0,
      remark: "",
    };
  };
  const emis = [emi("iPhone 16 Pro", 6250, 12, -6, 7), emi("Royal Enfield", 3400, 24, -15, 15), emi("Sofa set", 2500, 9, 1, 10), emi("MacBook Air", 4999, 6, -9, 5)];

  // The iPhone EMI's monthly payments are recorded from the Shortcut.
  const emiPayments: EmiPayment[] = [];
  const iphone = emis[0];
  for (let k = 0; k < iphone.tenure; k++) {
    const due = addMonths(iphone.startDate!, k);
    if (due > now) break;
    emiPayments.push({ id: `p${k}`, date: due, emiName: iphone.name, amount: iphone.monthly, paymentMethod: "Credit Card", cardName: "Kotak MOJO CC", remark: "" });
  }
  emiPayments.sort((a, b) => b.date.getTime() - a.date.getTime());

  // Investments: two SIPs, digital gold, quarterly NPS, a yearly PPF top-up and a few one-off buys.
  const investments: Investment[] = [];
  const invest = (at: Date, amount: number, type: string, frequency: string, paymentMethod: string, name: string, platform = "") => {
    if (at <= now) investments.push({ id: `i${investments.length}`, date: at, amount, type, frequency, paymentMethod, remark: "", name, platform, cardName: "" });
  };
  for (let m = addMonths(startOfMonth(now), -14); m <= now; m = addMonths(m, 1)) {
    const on = (day: number) => new Date(m.getFullYear(), m.getMonth(), day, 9, 30);
    invest(on(5), 5000, "Mutual Fund", "Monthly", "Auto-debit", "Parag Parikh Flexi Cap", "Groww");
    invest(on(10), 3000, "Mutual Fund", "Monthly", "Auto-debit", "Nifty 50 Index Fund", "Groww");
    invest(on(20), 1000, "Gold", "Monthly", "UPI", "Digital gold", "PhonePe");
    if (m.getMonth() % 3 === 0) invest(on(15), 6000, "NPS", "Quarterly", "Net Banking", "NPS Tier I");
    if (m.getMonth() === 3) invest(on(12), 50000, "PPF", "Yearly", "Net Banking", "PPF account");
  }
  const back = (days: number) => addDays(today, -days);
  invest(new Date(back(38).setHours(11, 5)), 12400, "Stocks", "One-time", "Net Banking", "Infosys", "Zerodha");
  invest(new Date(back(96).setHours(14, 20)), 8750, "Stocks", "One-time", "Net Banking", "Tata Motors", "Zerodha");
  invest(new Date(back(150).setHours(10, 0)), 25000, "FD", "One-time", "Net Banking", "HDFC FD · 1 year", "Bank");
  invest(new Date(back(210).setHours(16, 45)), 4200, "Stocks", "One-time", "UPI", "ITC", "Zerodha");
  investments.sort((a, b) => b.date.getTime() - a.date.getTime());

  return { expenses, subscriptions, investments, emis, emiPayments, syncedAt: now };
}
