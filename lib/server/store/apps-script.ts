import "server-only";
import { normalizeProfile } from "@/lib/profile";
import type { ApiResponse, Profile } from "@/lib/types";
import type { LoadResult, NewEntry, Store, WriteResult } from "./types";
import { dataVersion } from "./version";

const OLDER_SCRIPT = "Your Apps Script is an older version. Paste the latest Code.gs and deploy a new version.";

/** Self-host mode (v1): reads and writes through the Apps Script web app. The key never leaves the server. */
export class AppsScriptStore implements Store {
  constructor(
    private readonly url: string,
    private readonly key: string,
    private readonly fetchImpl: typeof fetch = fetch,
  ) {}

  async load(): Promise<LoadResult> {
    if (!this.key) return { ok: false, status: 500, error: "DASHBOARD_KEY is missing from your environment." };

    let target: URL;
    try {
      target = new URL(this.url);
    } catch {
      return { ok: false, status: 500, error: "APPS_SCRIPT_URL is not a valid URL." };
    }
    target.searchParams.set("key", this.key);

    let text: string;
    try {
      const res = await this.fetchImpl(target, { cache: "no-store", redirect: "follow", signal: AbortSignal.timeout(25_000) });
      if (!res.ok) return { ok: false, status: 502, error: `Google Apps Script responded with ${res.status}.` };
      text = await res.text();
    } catch (err) {
      const timedOut = (err as Error).name === "TimeoutError";
      return { ok: false, status: 504, error: timedOut ? "Google Apps Script took too long to respond." : "Couldn't reach Google Apps Script." };
    }

    let json: ApiResponse;
    try {
      json = JSON.parse(text);
    } catch {
      return {
        ok: false,
        status: 502,
        error: "Apps Script didn't return data. Deploy a new version of Code.gs (with doGet) and check the URL.",
      };
    }
    if (!json.ok) {
      const error = json.error === "Unauthorized" ? "DASHBOARD_KEY doesn't match the key in Apps Script." : (json.error ?? "Unknown error");
      return { ok: false, status: 502, error };
    }

    const data = {
      expenses: json.expenses ?? [],
      subscriptions: json.subscriptions ?? [],
      emis: json.emis ?? [],
      emiPayments: json.emiPayments ?? [],
      investments: json.investments ?? [],
      profile: normalizeProfile(json.profile),
    };
    return { ok: true, demo: false, version: dataVersion(data), generatedAt: json.generatedAt ?? new Date().toISOString(), ...data };
  }

  append(entry: NewEntry): Promise<WriteResult> {
    switch (entry.kind) {
      case "expense":
        return this.post({
          Type: "ManualExpense",
          Amount: entry.amount,
          Category: entry.category,
          Remark: entry.remark,
          ...(entry.paymentMethod ? { PaymentMethod: entry.paymentMethod } : {}),
          ...(entry.cardName ? { CardName: entry.cardName } : {}),
          ...(entry.merchant ? { Merchant: entry.merchant } : {}),
          Date: entry.date.toISOString(),
        });
      case "subscription":
        return this.post({
          Type: "Subscription",
          Amount: entry.amount,
          Name: entry.name,
          Frequency: entry.frequency,
          AutoRenew: entry.autoRenew ? "Yes" : "No",
          PaymentMethod: entry.paymentMethod,
          CardName: entry.cardName,
          Remark: entry.remark,
          Date: entry.date.toISOString(),
        });
      case "emiPayment":
        return this.post({
          Type: "EMIPayment",
          Amount: entry.amount,
          EMIName: entry.emiName,
          PaymentMethod: entry.paymentMethod,
          CardName: entry.cardName,
          Remark: entry.remark,
          Date: entry.date.toISOString(),
        });
      case "investment":
        return this.post(
          {
            Type: "ManualInvestment",
            Amount: entry.amount,
            InvestmentType: entry.type,
            Frequency: entry.frequency,
            PaymentMethod: entry.paymentMethod,
            Remark: entry.remark,
            ...(entry.name ? { InvestmentName: entry.name } : {}),
            ...(entry.platform ? { Platform: entry.platform } : {}),
            ...(entry.cardName ? { CardName: entry.cardName } : {}),
            Date: entry.date.toISOString(),
          },
          "Your Apps Script doesn't know investments yet. Paste the latest Code.gs and deploy a new version.",
        );
      case "emi":
        return this.post({
          Type: "EMI",
          EMIName: entry.name,
          Amount: entry.amount,
          Tenure: entry.tenure,
          StartDate: entry.startDate,
          PaymentMethod: entry.paymentMethod,
          CardName: entry.cardName,
          ...(entry.type ? { EMIType: entry.type } : {}),
          ...(entry.paidBefore ? { PaidBefore: entry.paidBefore } : {}),
          ...(entry.remark ? { Remark: entry.remark } : {}),
        });
    }
  }

  /** Code.gs has no delete or edit yet: the row is changed in the sheet itself. */
  async remove(): Promise<WriteResult> {
    return { ok: false, error: "Delete this one in your Google Sheet: the Apps Script version of hisabo can't delete rows yet." };
  }

  async update(): Promise<WriteResult> {
    return { ok: false, error: "Edit this one in your Google Sheet: the Apps Script version of hisabo can't edit rows yet." };
  }

  async stopInvestment(): Promise<WriteResult> {
    return { ok: false, error: "The Apps Script version of hisabo can't stop a SIP yet." };
  }

  saveProfile(p: Profile): Promise<WriteResult> {
    return this.post({
      Type: "Profile",
      Name: p.name,
      Email: p.email ?? "",
      MonthlyIncome: p.monthlyIncome ?? "",
      MonthlyBudget: p.monthlyBudget ?? "",
      Payday: p.payday ?? "",
    });
  }

  /** doPost answers in plain text: "Success - Type: …" or "Error: …". */
  private async post(body: Record<string, unknown>, unknownTypeMessage = OLDER_SCRIPT): Promise<WriteResult> {
    let text: string;
    try {
      const res = await this.fetchImpl(this.url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...body, Key: this.key }),
        redirect: "follow",
        cache: "no-store",
        signal: AbortSignal.timeout(25_000),
      });
      text = await res.text();
    } catch {
      return { ok: false, error: "Couldn't reach Google Apps Script. Try again in a moment." };
    }

    if (text.startsWith("Success")) return { ok: true };
    if (text.includes("Unknown transaction type")) return { ok: false, error: unknownTypeMessage };
    if (text.includes("Unauthorized")) return { ok: false, error: "DASHBOARD_KEY doesn't match the key in Apps Script." };
    return { ok: false, error: text.startsWith("Error: ") ? text.slice(7) : "Couldn't save to your sheet." };
  }
}
