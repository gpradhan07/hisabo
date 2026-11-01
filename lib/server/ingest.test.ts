import { beforeEach, describe, expect, it } from "vitest";
import { MemoryKeys } from "@/test/fake-auth";
import { FakeSheets } from "@/test/fake-sheets";
import { handleIngest, NOT_PAIRED, parseIngest, savedMessage, SHORTCUT_LISTS, type IngestDeps } from "./ingest";
import { activeKeys, newPhoneKey, resolvePhoneKey, revokeKey, setupCode } from "./phone-keys";
import { createSpreadsheet, GoogleSheetsStore } from "./store/google-sheets";

const NOW = new Date("2026-10-22T06:30:00Z");

describe("parseIngest", () => {
  it("reads what the v1 Shortcut sends", () => {
    const res = parseIngest({ Amount: "₹1,250.50", Category: "Food & Dining", Remark: "Dinner", PaymentMethod: "UPI" }, NOW);
    expect(res).toEqual({
      ok: true,
      entry: { kind: "expense", amount: 1250.5, category: "Food & Dining", remark: "Dinner", date: NOW, paymentMethod: "UPI" },
    });
  });

  it.each([
    ["Rs. 250", 250],
    [99, 99],
    ["1,00,000", 100000],
  ])("reads the amount %j", (Amount, amount) => {
    expect(parseIngest({ Amount, Category: "Rent" }, NOW)).toMatchObject({ ok: true, entry: { amount } });
  });

  it("accepts a back-dated entry, but not a future one", () => {
    expect(parseIngest({ Amount: 5, Category: "Food", Date: "2026-10-20T13:00:00+05:30" }, NOW)).toMatchObject({
      ok: true,
      entry: { date: new Date("2026-10-20T07:30:00Z") },
    });
    expect(parseIngest({ Amount: 5, Category: "Food", Date: "2026-12-01T10:00:00Z" }, NOW)).toEqual({ ok: false, error: "The date can't be in the future." });
    expect(parseIngest({ Amount: 5, Category: "Food", Date: "someday" }, NOW)).toEqual({ ok: false, error: "hisabo couldn't read that date." });
  });

  it("reads an EMI with a day-first start date", () => {
    const res = parseIngest({ Type: "EMI", EMIName: "Phone", Amount: "2000", Tenure: "12", StartDate: "05/03/2026", PaymentMethod: "Credit Card", CardName: "HDFC" }, NOW);
    expect(res).toEqual({
      ok: true,
      entry: { kind: "emi", name: "Phone", amount: 2000, tenure: 12, startDate: "2026-03-05", paymentMethod: "Credit Card", cardName: "HDFC", type: "", paidBefore: 0, remark: "" },
    });
  });

  it("reads a subscription; one-time ones never renew", () => {
    expect(parseIngest({ Type: "Subscription", Amount: 649, Name: "Netflix", Frequency: "Monthly", AutoRenew: "Yes", PaymentMethod: "UPI (Credit Card)", CardName: "Kotak CC" }, NOW)).toEqual({
      ok: true,
      entry: { kind: "subscription", amount: 649, name: "Netflix", frequency: "Monthly", autoRenew: true, date: NOW, paymentMethod: "UPI (Credit Card)", cardName: "Kotak CC", remark: "" },
    });
    expect(parseIngest({ Type: "Subscription", Amount: 1999, Name: "Course", Frequency: "One-time", AutoRenew: "Yes" }, NOW)).toMatchObject({ ok: true, entry: { autoRenew: false } });
    expect(parseIngest({ Type: "Subscription", Amount: 10 }, NOW)).toEqual({ ok: false, error: "Name the subscription." });
  });

  it("reads an EMI payment ('EMI Payment' spelling too) and a new EMI's extra fields", () => {
    expect(parseIngest({ Type: "EMI Payment", Amount: 5000, EMIName: "iPhone", PaymentMethod: "UPI (Credit Card)", CardName: "Kotak CC" }, NOW)).toEqual({
      ok: true,
      entry: { kind: "emiPayment", amount: 5000, emiName: "iPhone", date: NOW, paymentMethod: "UPI (Credit Card)", cardName: "Kotak CC", remark: "" },
    });
    expect(parseIngest({ Type: "EMI", EMIName: "TV", Amount: 1000, Tenure: 6, StartDate: "2026-01-01", EMIType: "BNPL", PaidBefore: 7 }, NOW)).toEqual({
      ok: false,
      error: "Instalments already paid must be a whole number from 0 to 6.",
    });
  });

  it("reads an investment's name, platform and card, and a weekly frequency", () => {
    expect(parseIngest({ Type: "Investment", Amount: 500, InvestmentType: "Mutual Fund", InvestmentName: "Nifty 50", Frequency: "Weekly", Platform: "Groww", CardName: "IDFC CC" }, NOW)).toMatchObject({
      ok: true,
      entry: { kind: "investment", frequency: "Weekly", name: "Nifty 50", platform: "Groww", cardName: "IDFC CC" },
    });
  });

  it("reads an investment, tidying the frequency", () => {
    expect(parseIngest({ Type: "Investment", Amount: 5000, InvestmentType: "Mutual Fund", Frequency: "SIP", Remark: "Index" }, NOW)).toMatchObject({
      ok: true,
      entry: { kind: "investment", type: "Mutual Fund", frequency: "Monthly" },
    });
    expect(parseIngest({ Type: "Investment", Amount: 5000, InvestmentType: "Gold" }, NOW)).toMatchObject({ ok: true, entry: { frequency: "One-Time" } });
  });

  it.each([
    [{ Category: "Food" }, "Enter an amount above 0."],
    [{ Amount: 10 }, "Pick or type a category."],
    [{ Type: "Transfer", Amount: 10 }, 'hisabo doesn\'t know the entry type "Transfer". Use Expense, Subscription, Investment, EMI or EMIPayment.'],
    [{ Type: "EMI", Amount: 10, EMIName: "TV", Tenure: 0, StartDate: "2026-01-01" }, "Enter the number of months."],
    [[1, 2], "hisabo expected the entry as JSON."],
  ])("explains %j", (body, error) => {
    expect(parseIngest(body, NOW)).toEqual({ ok: false, error });
  });
});

describe("savedMessage", () => {
  it("reads like a receipt", () => {
    expect(savedMessage({ kind: "expense", amount: 250, category: "Food & Dining", remark: "", date: NOW }, "INR")).toBe("Saved ₹250.00 · Food & Dining");
    expect(savedMessage({ kind: "emi", name: "Phone", amount: 2000, tenure: 12, startDate: "2026-03-05", paymentMethod: "", cardName: "" }, "INR")).toBe(
      "Saved EMI · Phone · ₹2,000.00 a month for 12 months",
    );
  });
});

describe("phone keys", () => {
  let keys: MemoryKeys;
  beforeEach(() => {
    keys = new MemoryKeys();
  });

  it("stores only the hash and puts the key in the setup code", async () => {
    const { key, id } = newPhoneKey();
    expect(key).toMatch(/^hk_[\w-]{43}$/);
    await keys.create(id, { uid: "u1", label: "iPhone", createdAt: 1 });
    expect(JSON.stringify([...keys.docs])).not.toContain(key);
    expect(JSON.parse(setupCode("https://hisabo.app", key))).toEqual({ url: "https://hisabo.app/api/ingest", key });
  });

  it("resolves a key to its user, and records use at most hourly", async () => {
    const { key, id } = newPhoneKey();
    await keys.create(id, { uid: "u1", label: "iPhone", createdAt: 1 });
    expect(await resolvePhoneKey(keys, key, 1_000_000)).toEqual({ id, uid: "u1" });
    expect(await resolvePhoneKey(keys, key, 1_000_000 + 60_000)).toEqual({ id, uid: "u1" });
    expect(keys.writes).toBe(1);
    expect(await resolvePhoneKey(keys, key, 1_000_000 + 2 * 3_600_000)).not.toBeNull();
    expect(keys.writes).toBe(2);
  });

  it("refuses unknown, malformed and revoked keys", async () => {
    const { key, id } = newPhoneKey();
    await keys.create(id, { uid: "u1", label: "iPhone", createdAt: 1 });
    expect(await resolvePhoneKey(keys, newPhoneKey().key)).toBeNull();
    expect(await resolvePhoneKey(keys, "not-a-key")).toBeNull();
    expect(await revokeKey(keys, "someone-else", id)).toBe(false);
    expect(await revokeKey(keys, "u1", id)).toBe(true);
    expect(await resolvePhoneKey(keys, key)).toBeNull();
    expect(await activeKeys(keys, "u1")).toEqual([]);
  });
});

describe("handleIngest", () => {
  let keys: MemoryKeys, sheets: FakeSheets, sheetId: string, key: string, lost: string[], signalled: string[];
  let deps: IngestDeps;

  beforeEach(async () => {
    keys = new MemoryKeys();
    sheets = new FakeSheets();
    lost = [];
    signalled = [];
    const created = await createSpreadsheet({ accessToken: async () => sheets.validToken, timeZone: "Asia/Kolkata", fetch: sheets.fetch });
    if (!created.ok) throw new Error(created.error);
    sheetId = created.spreadsheetId;
    const k = newPhoneKey();
    key = k.key;
    await keys.create(k.id, { uid: "u1", label: "iPhone", createdAt: 1 });
    deps = {
      phoneKeys: keys,
      currency: "INR",
      markDriveLost: async (uid) => void lost.push(uid),
      notify: async (uid) => void signalled.push(uid),
      storeForUser: async () => ({
        ok: true,
        // The token hisabo holds; the test can make Google stop accepting it.
        store: new GoogleSheetsStore({ spreadsheetId: sheetId, accessToken: async () => "token-1", fetch: sheets.fetch }),
      }),
    };
  });

  const post = (body: unknown, auth = `Bearer ${key}`, ip = `ip-${Math.random()}`) =>
    handleIngest(deps, { method: "POST", authorization: auth, ip, body: typeof body === "string" ? body : JSON.stringify(body) });

  it("tells the user's open dashboards about a saved entry, and only a saved one", async () => {
    await post({ Amount: 250, Category: "Food & Dining" });
    expect(signalled).toEqual(["u1"]);
    await post({ Amount: -5, Category: "Food & Dining" });
    await post({ Amount: 250, Category: "Food & Dining" }, "Bearer hk_not-a-real-key-at-all-000000000000000000");
    expect(signalled).toEqual(["u1"]);
  });

  it("saves an entry to the user's sheet and answers with a receipt", async () => {
    expect(await post({ Amount: 250, Category: "Food & Dining", Remark: "Lunch", PaymentMethod: "UPI" })).toEqual({
      status: 200,
      text: "Saved ₹250.00 · Food & Dining",
    });
    expect(sheets.rows(sheetId, "Expenses")[1].slice(1)).toEqual([250, "Food & Dining", "Lunch", "UPI"]);
  });

  it("gives the Shortcut its lists", async () => {
    expect(await handleIngest(deps, { method: "GET", authorization: `Bearer ${key}`, ip: "x" })).toEqual({ status: 200, json: SHORTCUT_LISTS });
  });

  it.each([
    ["no key", null],
    ["a wrong key", `Bearer ${"hk_" + "a".repeat(43)}`],
    ["a malformed header", "Basic abc"],
  ])("refuses %s", async (_, auth) => {
    expect(await post({ Amount: 1, Category: "x" }, auth as string)).toEqual({ status: 401, text: NOT_PAIRED });
  });

  it("answers GET errors as JSON, so the Shortcut can read them", async () => {
    expect(await handleIngest(deps, { method: "GET", authorization: null, ip: "y" })).toEqual({ status: 401, json: { error: NOT_PAIRED } });
  });

  it("explains a bad entry or a body that isn't JSON", async () => {
    expect(await post({ Amount: 0, Category: "Food" })).toEqual({ status: 400, text: "Enter an amount above 0." });
    expect((await post("Amount=250")).status).toBe(400);
    expect((await post("x".repeat(10_001))).status).toBe(413);
  });

  it("limits one phone to 30 entries a minute", async () => {
    const statuses = [];
    for (let i = 0; i < 31; i++) statuses.push((await post({ Amount: 1, Category: "x" }, `Bearer ${key}`, `ip-${i}`)).status);
    expect(statuses.slice(0, 30).every((s) => s === 200)).toBe(true);
    expect(statuses[30]).toBe(429);
  });

  it("asks the user to reconnect Drive when Google access is gone", async () => {
    sheets.validToken = "revoked";
    expect(await post({ Amount: 1, Category: "x" })).toEqual({ status: 409, text: "hisabo can't reach your Google Drive. Open hisabo to reconnect it." });
    expect(lost).toEqual(["u1"]);
  });
});
