import { beforeEach, describe, expect, it } from "vitest";
import { FakeSheets } from "@/test/fake-sheets";
import { createSpreadsheet, GoogleSheetsStore, TABS, type AccessTokenSource } from "./google-sheets";

const TZ = "Asia/Kolkata";
let google: FakeSheets;

beforeEach(() => {
  google = new FakeSheets();
});

/** An access-token source that hands out whatever Google currently accepts. */
const freshToken = () => Promise.resolve(google.validToken);

async function newSheet(timeZone = TZ) {
  const res = await createSpreadsheet({ accessToken: freshToken, timeZone, fetch: google.fetch });
  if (!res.ok) throw new Error(res.error);
  return res.spreadsheetId;
}

const storeFor = (spreadsheetId: string, accessToken: AccessTokenSource = freshToken) => new GoogleSheetsStore({ spreadsheetId, accessToken, fetch: google.fetch });

async function load(store: GoogleSheetsStore) {
  const res = await store.load();
  if (!res.ok) throw new Error(res.error);
  return res;
}

describe("createSpreadsheet", () => {
  it("creates the six tabs with Code.gs headers in the user's time zone", async () => {
    const id = await newSheet();
    const file = google.file(id);
    expect(file.title).toBe("hisabo");
    expect(file.timeZone).toBe(TZ);
    expect(file.tabs.map((t) => t.title)).toEqual(["Expenses", "Subscriptions", "EMI", "EMI Payments", "Investments", "Profile"]);
    for (const tab of Object.values(TABS)) expect(google.rows(id, tab.title)).toEqual([[...tab.headers]]);
  });

  it("falls back to UTC for an unknown time zone", async () => {
    const id = await newSheet("Not/AZone");
    expect(google.file(id).timeZone).toBe("UTC");
  });
});

describe("GoogleSheetsStore", () => {
  it("loads a new spreadsheet as empty", async () => {
    const res = await load(storeFor(await newSheet()));
    expect(res).toMatchObject({ ok: true, demo: false, expenses: [], emis: [], investments: [], profile: null });
    expect(res.version).toMatch(/^[\w-]{16}$/);
  });

  it("appends an expense as a real date and reads it back at the same instant", async () => {
    const id = await newSheet();
    const store = storeFor(id);
    const date = new Date("2026-10-21T09:00:00Z");
    expect(await store.append({ kind: "expense", amount: 250, category: "Food", remark: "Lunch", date, paymentMethod: "UPI" })).toEqual({ ok: true });

    const [, row] = google.rows(id, "Expenses");
    expect(typeof row[0]).toBe("number"); // a date cell, not text
    expect(row.slice(1)).toEqual([250, "Food", "Lunch", "UPI"]);

    const { expenses } = await load(store);
    expect(expenses).toEqual([
      { row: 2, date: date.toISOString(), amount: 250, category: "Food", remark: "Lunch", paymentMethod: "UPI", cardName: "", merchant: "" },
    ]);
  });

  it("stores text exactly as typed, never as a formula or a date", async () => {
    const id = await newSheet();
    const store = storeFor(id);
    const date = new Date("2026-10-21T09:00:00Z");
    await store.append({ kind: "expense", amount: 10, category: "=HYPERLINK(\"http://x\")", remark: "1/2", date, paymentMethod: "TRUE", cardName: "007" });
    const { expenses } = await load(store);
    expect(expenses[0]).toMatchObject({ category: '=HYPERLINK("http://x")', remark: "1/2", paymentMethod: "TRUE", cardName: "007" });
  });

  it("appends an EMI with a rounded total and a real start date", async () => {
    const id = await newSheet();
    const store = storeFor(id);
    await store.append({ kind: "emi", name: "Phone", amount: 1234.56, tenure: 12, startDate: "2026-03-05", paymentMethod: "Card", cardName: "HDFC" });

    const [, row] = google.rows(id, "EMI");
    expect(row.slice(1, 5)).toEqual(["Phone", 1234.56, 12, 14814.72]);
    expect(typeof row[5]).toBe("number");

    const { emis } = await load(store);
    expect(emis[0]).toMatchObject({ row: 2, name: "Phone", monthly: 1234.56, tenure: 12, total: 14814.72, paymentMethod: "Card", cardName: "HDFC" });
    // Midnight on 5 March in India.
    expect(emis[0].startDate).toBe("2026-03-04T18:30:00.000Z");
    expect(emis[0].addedOn).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });

  it("appends an investment", async () => {
    const id = await newSheet();
    const store = storeFor(id);
    const date = new Date("2026-10-01T04:30:00Z");
    await store.append({ kind: "investment", amount: 5000, type: "Mutual Fund", frequency: "Monthly", paymentMethod: "UPI", remark: "Index fund", date });
    const { investments } = await load(store);
    expect(investments).toEqual([
      {
        row: 2,
        date: date.toISOString(),
        amount: 5000,
        investmentType: "Mutual Fund",
        frequency: "Monthly",
        paymentMethod: "UPI",
        remark: "Index fund",
        investmentName: "",
        platform: "",
        cardName: "",
      },
    ]);
  });

  it("saves the profile and replaces the previous one", async () => {
    const id = await newSheet();
    const store = storeFor(id);
    await store.saveProfile({ name: "Asha", email: "asha@example.com", monthlyIncome: 90000, monthlyBudget: 40000, payday: 1 });
    await store.saveProfile({ name: "Asha K", monthlyBudget: 35000 });

    expect(google.rows(id, "Profile")).toEqual([
      ["Field", "Value"],
      ["Name", "Asha K"],
      ["Email"],
      ["Monthly income"],
      ["Monthly budget", 35000],
      ["Payday (day of month)"],
    ]);
    expect((await load(store)).profile).toEqual({ name: "Asha K", monthlyBudget: 35000 });
  });

  it("recreates a deleted tab with its headers", async () => {
    const id = await newSheet();
    google.file(id).tabs = google.file(id).tabs.filter((t) => t.title !== "Expenses");
    const store = storeFor(id);
    expect((await load(store)).expenses).toEqual([]);

    const res = await store.append({ kind: "expense", amount: 99, category: "Travel", remark: "", date: new Date() });
    expect(res).toEqual({ ok: true });
    const rows = google.rows(id, "Expenses");
    expect(rows[0]).toEqual([...TABS.expenses.headers]);
    expect(rows[1].slice(1, 3)).toEqual([99, "Travel"]);
  });

  it("puts the header back when the user emptied a tab", async () => {
    const id = await newSheet();
    google.tab(id, "Investments")!.rows = [];
    await storeFor(id).append({ kind: "investment", amount: 100, type: "Gold", frequency: "One-Time", paymentMethod: "", remark: "", date: new Date() });
    const rows = google.rows(id, "Investments");
    expect(rows[0]).toEqual([...TABS.investments.headers]);
    expect(rows[1].slice(1, 4)).toEqual([100, "Gold", "One-Time"]);
  });

  it("recreates a deleted Profile tab when saving", async () => {
    const id = await newSheet();
    google.file(id).tabs = google.file(id).tabs.filter((t) => t.title !== "Profile");
    expect(await storeFor(id).saveProfile({ name: "Ravi" })).toEqual({ ok: true });
    expect(google.rows(id, "Profile")[1]).toEqual(["Name", "Ravi"]);
  });

  it("reads sheets the Apps Script wrote, including a header-less Expenses tab", async () => {
    const serial = (iso: string) => (Date.parse(iso) - Date.UTC(1899, 11, 30)) / 86_400_000;
    const id = google.seed({
      title: "My expenses",
      timeZone: "UTC",
      tabs: {
        Expenses: [
          [serial("2026-01-05T10:00:00Z"), 120, "Food", "Tea"],
          [serial("2026-01-06T10:00:00Z"), "", "Ignored: no amount"],
          ["not a date", 5, "Ignored"],
        ],
        EMI: [[...TABS.emis.headers], [serial("2026-01-01T00:00:00Z"), "Laptop", 5000, 10, 50000, "05/03/2026"]],
        Profile: [["Field", "Value"], ["name", "Gourav"], ["Payday (day of month)", 7]],
      },
    });
    const res = await load(storeFor(id));
    expect(res.expenses).toEqual([
      { row: 1, date: "2026-01-05T10:00:00.000Z", amount: 120, category: "Food", remark: "Tea", paymentMethod: "", cardName: "", merchant: "" },
    ]);
    // Text start dates are passed through for the dashboard to read day-first.
    expect(res.emis[0]).toMatchObject({ row: 2, name: "Laptop", startDate: "05/03/2026", addedOn: "2026-01-01T00:00:00.000Z" });
    expect(res.investments).toEqual([]);
    expect(res.profile).toEqual({ name: "Gourav", payday: 7 });
  });

  it("gives the same version for the same data, and a new one after a change", async () => {
    const store = storeFor(await newSheet());
    const a = await load(store);
    const b = await load(store);
    expect(a.version).toBe(b.version);
    await store.saveProfile({ name: "Asha" });
    expect((await load(store)).version).not.toBe(a.version);
  });

  it("asks for a fresh token once when Google rejects the current one", async () => {
    const id = await newSheet();
    google.validToken = "token-2";
    const refreshes: boolean[] = [];
    const store = storeFor(id, async (opts) => {
      refreshes.push(!!opts?.refresh);
      return opts?.refresh ? "token-2" : "token-1";
    });
    expect((await store.load()).ok).toBe(true);
    expect(refreshes.slice(0, 2)).toEqual([false, true]);
  });

  it("reports a revoked Google grant as reauth", async () => {
    const id = await newSheet();
    google.validToken = "revoked";
    const res = await storeFor(id, async () => "token-1").load();
    expect(res).toMatchObject({ ok: false, status: 401, code: "reauth" });
    const write = await storeFor(id, async () => "token-1").append({ kind: "expense", amount: 1, category: "x", remark: "", date: new Date() });
    expect(write).toMatchObject({ ok: false, code: "reauth" });
  });

  it("reports a deleted spreadsheet as sheet-missing", async () => {
    const res = await storeFor("does-not-exist").load();
    expect(res).toMatchObject({ ok: false, status: 404, code: "sheet-missing" });
  });

  it("saves subscriptions and reads them back", async () => {
    const id = await newSheet();
    const store = storeFor(id);
    const date = new Date("2026-10-10T03:30:00Z");
    const sub = { kind: "subscription" as const, amount: 649, name: "Netflix", frequency: "Monthly", autoRenew: true, date, paymentMethod: "UPI (Credit Card)", cardName: "Kotak CC", remark: "" };
    expect(await store.append(sub)).toEqual({ ok: true });
    const { subscriptions } = await load(store);
    expect(subscriptions).toEqual([
      { row: 2, date: date.toISOString(), amount: 649, name: "Netflix", frequency: "Monthly", autoRenew: "Yes", paymentMethod: "UPI (Credit Card)", cardName: "Kotak CC", remark: "" },
    ]);
  });

  it("records an EMI payment under the EMI's own name, and refuses one for an unknown EMI", async () => {
    const id = await newSheet();
    const store = storeFor(id);
    await store.append({ kind: "emi", name: "iPhone", amount: 5000, tenure: 12, startDate: "2026-05-07", paymentMethod: "", cardName: "", type: "Credit Card EMI", paidBefore: 2, remark: "" });
    const pay = { kind: "emiPayment" as const, amount: 5000, date: new Date("2026-10-07T04:00:00Z"), paymentMethod: "UPI (Credit Card)", cardName: "Kotak CC", remark: "" };
    expect(await store.append({ ...pay, emiName: "iphone" })).toEqual({ ok: true });
    expect(await store.append({ ...pay, emiName: "Car" })).toEqual({ ok: false, error: 'No EMI called "Car". Add it with New EMI first.' });
    const { emis, emiPayments } = await load(store);
    expect(emis[0]).toMatchObject({ name: "iPhone", emiType: "Credit Card EMI", paidBefore: 2 });
    expect(emiPayments).toEqual([
      { row: 2, date: "2026-10-07T04:00:00.000Z", emiName: "iPhone", amount: 5000, paymentMethod: "UPI (Credit Card)", cardName: "Kotak CC", remark: "" },
    ]);
  });

  it("adds the newer columns' headers to a sheet made by an older hisabo", async () => {
    const id = google.seed({
      title: "hisabo",
      timeZone: "UTC",
      tabs: { Expenses: [["Date", "Amount", "Category", "Remark", "Payment Method", "Card Name"]], Investments: [["Date", "Amount", "Investment Type", "Frequency", "Payment Method", "Remark"]] },
    });
    await load(storeFor(id));
    expect(google.rows(id, "Expenses")[0]).toEqual([...TABS.expenses.headers]);
    expect(google.rows(id, "Investments")[0]).toEqual([...TABS.investments.headers]);
  });

  it("reads all tabs in two requests", async () => {
    const store = storeFor(await newSheet());
    google.calls.length = 0;
    await store.load();
    expect(google.calls).toEqual(["GET /v4/spreadsheets/sheet-1", "GET /v4/spreadsheets/sheet-1/values:batchGet"]);
  });
});

describe("deleting entries", () => {
  const at = (iso: string) => new Date(iso);
  const expense = (amount: number, iso: string, category = "Food") => ({ kind: "expense" as const, amount, category, remark: "", date: at(iso) });

  async function sheetWith(...entries: ReturnType<typeof expense>[]) {
    const id = await newSheet();
    const store = storeFor(id);
    for (const e of entries) await store.append(e);
    return { id, store };
  }

  it("deletes the row the dashboard showed", async () => {
    const { id, store } = await sheetWith(expense(100, "2026-10-01T04:00:00Z"), expense(200, "2026-10-02T04:00:00Z"), expense(300, "2026-10-03T04:00:00Z"));
    expect(await store.remove([{ tab: "expenses", row: 3, date: "2026-10-02T04:00:00.000Z", amount: 200 }])).toEqual({ ok: true });
    expect(google.rows(id, "Expenses").slice(1).map((r) => r[1])).toEqual([100, 300]);
  });

  it("finds the entry when rows moved since the dashboard loaded", async () => {
    const { id, store } = await sheetWith(expense(100, "2026-10-01T04:00:00Z"), expense(200, "2026-10-02T04:00:00Z"), expense(300, "2026-10-03T04:00:00Z"));
    // Row 2 deleted first; the dashboard still thinks ₹300 is on row 4.
    await store.remove([{ tab: "expenses", row: 2, date: "2026-10-01T04:00:00.000Z", amount: 100 }]);
    expect(await store.remove([{ tab: "expenses", row: 4, date: "2026-10-03T04:00:00.000Z", amount: 300 }])).toEqual({ ok: true });
    expect(google.rows(id, "Expenses").slice(1).map((r) => r[1])).toEqual([200]);
  });

  it("deletes nothing when the entry isn't there anymore, and never the header", async () => {
    const { id, store } = await sheetWith(expense(100, "2026-10-01T04:00:00Z"));
    const res = await store.remove([{ tab: "expenses", row: 2, date: "2026-10-01T04:00:00.000Z", amount: 999 }]);
    expect(res).toMatchObject({ ok: false, error: expect.stringMatching(/isn't in your sheet/) });
    expect(await store.remove([{ tab: "expenses", row: 1, date: "2026-10-01T04:00:00.000Z", amount: 999 }])).toMatchObject({ ok: false });
    expect(google.rows(id, "Expenses")).toHaveLength(2);
    expect(google.rows(id, "Expenses")[0][0]).toBe("Date");
  });

  it("deletes a subscription payment from the Subscriptions tab", async () => {
    const id = await newSheet();
    const store = storeFor(id);
    const date = at("2026-10-10T03:30:00Z");
    await store.append({ kind: "subscription", amount: 649, name: "Netflix", frequency: "Monthly", autoRenew: true, date, paymentMethod: "UPI", cardName: "", remark: "" });
    expect(await store.remove([{ tab: "subscriptions", row: 2, date: date.toISOString(), amount: 649 }])).toEqual({ ok: true });
    expect(google.rows(id, "Subscriptions")).toEqual([[...TABS.subscriptions.headers]]);
  });
});

describe("editing an expense", () => {
  it("rewrites date, amount, category and note, and keeps how it was paid", async () => {
    const id = await newSheet();
    const store = storeFor(id);
    const date = new Date("2026-10-21T09:00:00Z");
    await store.append({ kind: "expense", amount: 250, category: "Food", remark: "Lunch", date, paymentMethod: "UPI (Credit Card)", cardName: "Kotak CC", merchant: "Swiggy" });
    const moved = new Date("2026-10-20T13:30:00Z");
    expect(await store.update({ tab: "expenses", row: 2, date: date.toISOString(), amount: 250 }, { amount: 275, category: "Groceries", remark: "Veg", date: moved })).toEqual({ ok: true });

    const { expenses } = await load(store);
    expect(expenses).toEqual([
      { row: 2, date: moved.toISOString(), amount: 275, category: "Groceries", remark: "Veg", paymentMethod: "UPI (Credit Card)", cardName: "Kotak CC", merchant: "Swiggy" },
    ]);
  });

  it("changes nothing when the entry isn't there anymore", async () => {
    const id = await newSheet();
    const store = storeFor(id);
    const date = new Date("2026-10-21T09:00:00Z");
    await store.append({ kind: "expense", amount: 250, category: "Food", remark: "", date });
    const res = await store.update({ tab: "expenses", row: 2, date: date.toISOString(), amount: 999 }, { amount: 1, category: "X", remark: "", date });
    expect(res).toMatchObject({ ok: false });
    expect(google.rows(id, "Expenses")[1][1]).toBe(250);
  });
});

describe("deleting from the other tabs", () => {
  const iso = (d: string) => new Date(d).toISOString();

  it("deletes an investment", async () => {
    const id = await newSheet();
    const store = storeFor(id);
    const date = new Date("2026-10-05T04:00:00Z");
    await store.append({ kind: "investment", amount: 5000, type: "Mutual Fund", frequency: "Monthly", paymentMethod: "UPI", remark: "", date });
    expect(await store.remove([{ tab: "investments", row: 2, date: date.toISOString(), amount: 5000 }])).toEqual({ ok: true });
    expect(google.rows(id, "Investments")).toEqual([[...TABS.investments.headers]]);
  });

  it("deletes an EMI (matched by name, its date added may be blank) with its recorded payments, in one go", async () => {
    const id = await newSheet();
    const store = storeFor(id);
    await store.append({ kind: "emi", name: "Laptop", amount: 3000, tenure: 6, startDate: "2026-06-07", paymentMethod: "", cardName: "" });
    await store.append({ kind: "emi", name: "iPhone", amount: 5000, tenure: 12, startDate: "2026-05-07", paymentMethod: "", cardName: "" });
    for (const d of ["2026-09-07T04:00:00Z", "2026-10-07T04:00:00Z"])
      await store.append({ kind: "emiPayment", emiName: "iPhone", amount: 5000, date: new Date(d), paymentMethod: "", cardName: "", remark: "" });
    await store.append({ kind: "emiPayment", emiName: "Laptop", amount: 3000, date: new Date("2026-10-07T05:00:00Z"), paymentMethod: "", cardName: "", remark: "" });

    const res = await store.remove([
      { tab: "emis", row: 3, amount: 5000, name: "iPhone" },
      { tab: "emiPayments", row: 2, date: iso("2026-09-07T04:00:00Z"), amount: 5000, name: "iPhone" },
      { tab: "emiPayments", row: 3, date: iso("2026-10-07T04:00:00Z"), amount: 5000, name: "iPhone" },
    ]);
    expect(res).toEqual({ ok: true });
    expect(google.rows(id, "EMI").slice(1).map((r) => r[1])).toEqual(["Laptop"]);
    expect(google.rows(id, "EMI Payments").slice(1).map((r) => r[1])).toEqual(["Laptop"]);
  });

  it("deletes nothing when one of the rows is gone", async () => {
    const id = await newSheet();
    const store = storeFor(id);
    const a = new Date("2026-10-01T04:00:00Z");
    const b = new Date("2026-10-02T04:00:00Z");
    await store.append({ kind: "expense", amount: 100, category: "Food", remark: "", date: a });
    await store.append({ kind: "expense", amount: 200, category: "Food", remark: "", date: b });
    const res = await store.remove([
      { tab: "expenses", row: 2, date: a.toISOString(), amount: 100 },
      { tab: "expenses", row: 3, date: b.toISOString(), amount: 999 },
    ]);
    expect(res).toMatchObject({ ok: false });
    expect(google.rows(id, "Expenses")).toHaveLength(3);
  });

  it("tells two identical rows apart when deleting both", async () => {
    const id = await newSheet();
    const store = storeFor(id);
    const a = new Date("2026-10-01T04:00:00Z");
    for (let i = 0; i < 3; i++) await store.append({ kind: "expense", amount: 100, category: "Food", remark: "", date: a });
    const ref = (row: number) => ({ tab: "expenses" as const, row, date: a.toISOString(), amount: 100 });
    expect(await store.remove([ref(2), ref(3)])).toEqual({ ok: true });
    expect(google.rows(id, "Expenses")).toHaveLength(2);
  });
});

describe("stopping a SIP", () => {
  it("saves the stop date in the plan's row and clears it again on resume", async () => {
    const id = await newSheet();
    const store = storeFor(id);
    const date = new Date("2026-08-05T04:30:00Z");
    await store.append({ kind: "investment", amount: 5000, type: "Mutual Fund", frequency: "Monthly", paymentMethod: "UPI", remark: "", date, name: "Nifty 50" });
    const ref = { tab: "investments" as const, row: 2, date: date.toISOString(), amount: 5000 };
    const stop = new Date("2026-10-20T06:00:00Z");
    expect(await store.stopInvestment(ref, stop)).toEqual({ ok: true });
    expect((await load(store)).investments[0].stoppedOn).toBe(stop.toISOString());
    expect(await store.stopInvestment(ref, null)).toEqual({ ok: true });
    expect((await load(store)).investments[0]).not.toHaveProperty("stoppedOn");
  });

  it("adds the Stopped On heading to an Investments tab made before it existed", async () => {
    const id = google.seed({ title: "hisabo", timeZone: TZ, tabs: { Investments: [[...TABS.investments.headers.slice(0, 9)]] } });
    await load(storeFor(id));
    expect(google.rows(id, "Investments")[0]).toEqual([...TABS.investments.headers]);
  });
});
