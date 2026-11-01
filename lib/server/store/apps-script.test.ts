import { describe, expect, it } from "vitest";
import { AppsScriptStore } from "./apps-script";

const URL_ = "https://script.google.com/macros/s/test/exec";

/** A fake Apps Script web app: records what was sent and answers with `reply`. */
function fakeScript(reply: string | ((init?: RequestInit) => string), status = 200) {
  const sent: { url: string; body?: Record<string, unknown> }[] = [];
  const fetchImpl: typeof fetch = async (input, init) => {
    sent.push({ url: String(input), body: init?.body ? JSON.parse(String(init.body)) : undefined });
    return new Response(typeof reply === "function" ? reply(init) : reply, { status });
  };
  return { sent, fetchImpl };
}

describe("AppsScriptStore.load", () => {
  it("reads doGet with the key and passes the rows through", async () => {
    const doGet = {
      ok: true,
      generatedAt: "2026-10-21T09:00:00.000Z",
      expenses: [{ row: 2, date: "2026-10-21T08:00:00.000Z", amount: 250, category: "Food", remark: "Lunch" }],
      emis: [],
      investments: [],
      profile: { name: "Gourav", payday: 7 },
    };
    const { sent, fetchImpl } = fakeScript(JSON.stringify(doGet));
    const res = await new AppsScriptStore(URL_, "k123", fetchImpl).load();

    expect(new URL(sent[0].url).searchParams.get("key")).toBe("k123");
    expect(res).toMatchObject({ ok: true, demo: false, generatedAt: doGet.generatedAt, expenses: doGet.expenses, profile: { name: "Gourav", payday: 7 } });
    if (res.ok) expect(res.version).toMatch(/^[\w-]{16}$/);
  });

  it.each([
    ["a wrong key", JSON.stringify({ ok: false, error: "Unauthorized" }), 200, "DASHBOARD_KEY doesn't match the key in Apps Script."],
    ["an HTML page", "<html>", 200, "Apps Script didn't return data. Deploy a new version of Code.gs (with doGet) and check the URL."],
    ["a server error", "", 500, "Google Apps Script responded with 500."],
  ])("explains %s", async (_, body, status, error) => {
    const { fetchImpl } = fakeScript(body, status);
    expect(await new AppsScriptStore(URL_, "k", fetchImpl).load()).toEqual({ ok: false, status: 502, error });
  });

  it("needs the dashboard key", async () => {
    expect(await new AppsScriptStore(URL_, "").load()).toMatchObject({ ok: false, status: 500 });
  });
});

describe("AppsScriptStore writes", () => {
  const date = new Date("2026-10-21T09:00:00Z");

  it("sends a manual expense with the key", async () => {
    const { sent, fetchImpl } = fakeScript("Success - Type: ManualExpense");
    const res = await new AppsScriptStore(URL_, "k", fetchImpl).append({ kind: "expense", amount: 250, category: "Food", remark: "Lunch", date });
    expect(res).toEqual({ ok: true });
    expect(sent[0].body).toEqual({ Type: "ManualExpense", Key: "k", Amount: 250, Category: "Food", Remark: "Lunch", Date: date.toISOString() });
  });

  it("sends EMIs, investments and the profile in the Code.gs format", async () => {
    const { sent, fetchImpl } = fakeScript("Success");
    const store = new AppsScriptStore(URL_, "k", fetchImpl);
    await store.append({ kind: "emi", name: "Phone", amount: 2000, tenure: 6, startDate: "2026-03-05", paymentMethod: "Card", cardName: "HDFC" });
    await store.append({ kind: "investment", amount: 500, type: "PPF", frequency: "Yearly", paymentMethod: "", remark: "", date });
    await store.saveProfile({ name: "Asha", monthlyBudget: 30000 });
    expect(sent.map((s) => s.body)).toEqual([
      { Type: "EMI", Key: "k", EMIName: "Phone", Amount: 2000, Tenure: 6, StartDate: "2026-03-05", PaymentMethod: "Card", CardName: "HDFC" },
      { Type: "ManualInvestment", Key: "k", Amount: 500, InvestmentType: "PPF", Frequency: "Yearly", PaymentMethod: "", Remark: "", Date: date.toISOString() },
      { Type: "Profile", Key: "k", Name: "Asha", Email: "", MonthlyIncome: "", MonthlyBudget: 30000, Payday: "" },
    ]);
  });

  it.each([
    ["Error: Invalid amount", "expense", "Invalid amount"],
    ["Error: Unauthorized", "expense", "DASHBOARD_KEY doesn't match the key in Apps Script."],
    ["Error: Unknown transaction type", "expense", "Your Apps Script is an older version. Paste the latest Code.gs and deploy a new version."],
    ["Error: Unknown transaction type", "investment", "Your Apps Script doesn't know investments yet. Paste the latest Code.gs and deploy a new version."],
    ["<html>oops</html>", "expense", "Couldn't save to your sheet."],
  ] as const)("maps %j for an %s", async (reply, kind, error) => {
    const { fetchImpl } = fakeScript(reply);
    const store = new AppsScriptStore(URL_, "k", fetchImpl);
    const res =
      kind === "expense"
        ? await store.append({ kind, amount: 1, category: "x", remark: "", date })
        : await store.append({ kind, amount: 1, type: "x", frequency: "Monthly", paymentMethod: "", remark: "", date });
    expect(res).toEqual({ ok: false, error });
  });

  it("explains a network failure", async () => {
    const fetchImpl: typeof fetch = async () => {
      throw new TypeError("fetch failed");
    };
    expect(await new AppsScriptStore(URL_, "k", fetchImpl).saveProfile({ name: "A" })).toEqual({
      ok: false,
      error: "Couldn't reach Google Apps Script. Try again in a moment.",
    });
  });
});
