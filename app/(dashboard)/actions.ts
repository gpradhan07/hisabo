"use server";

import { cookies } from "next/headers";
import { validateEmi, type EmiErrors, type EmiInput } from "@/lib/emi-input";
import { validateExpense, type ExpenseErrors, type ExpenseInput } from "@/lib/expense-input";
import { validateInvestment, type InvestmentErrors, type InvestmentInput } from "@/lib/investment-input";
import { validateProfile, type ProfileErrors, type ProfileInput } from "@/lib/profile";
import { sheetConfig } from "@/lib/server/config";
import { SESSION_COOKIE, verifySessionToken } from "@/lib/server/session";
import type { Profile } from "@/lib/types";

export type SaveProfileResult =
  | { ok: true; profile: Profile }
  | { ok: false; error: string; fieldErrors?: ProfileErrors; demo?: boolean };

/** Saves the profile into the sheet's "Profile" tab through Apps Script (authorised with the dashboard key). */
export async function saveProfile(input: ProfileInput): Promise<SaveProfileResult> {
  const session = await verifySessionToken((await cookies()).get(SESSION_COOKIE)?.value);
  if (!session) return { ok: false, error: "Your session has expired. Please sign in again." };

  const checked = validateProfile(input);
  if (!checked.ok) return { ok: false, error: "Please fix the highlighted fields.", fieldErrors: checked.errors };
  const p = checked.profile;

  const { url, key } = sheetConfig();
  if (!url) return { ok: false, demo: true, error: "Demo mode: saved on this device only." };

  let text: string;
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        Type: "Profile",
        Key: key,
        Name: p.name,
        Email: p.email ?? "",
        MonthlyIncome: p.monthlyIncome ?? "",
        MonthlyBudget: p.monthlyBudget ?? "",
        Payday: p.payday ?? "",
      }),
      redirect: "follow",
      cache: "no-store",
      signal: AbortSignal.timeout(25_000),
    });
    text = await res.text();
  } catch {
    return { ok: false, error: "Couldn't reach Google Apps Script. Try again in a moment." };
  }

  if (text.startsWith("Success")) return { ok: true, profile: p };
  if (text.includes("Unknown transaction type")) {
    return { ok: false, error: "Your Apps Script is an older version. Paste the latest Code.gs and deploy a new version." };
  }
  if (text.includes("Unauthorized")) return { ok: false, error: "DASHBOARD_KEY doesn't match the key in Apps Script." };
  return { ok: false, error: text.startsWith("Error: ") ? text.slice(7) : "Couldn't save to your sheet." };
}

export type AddExpenseResult = { ok: true } | { ok: false; error: string; fieldErrors?: ExpenseErrors; demo?: boolean };

/** Appends a manually entered (possibly back-dated) expense to the Expenses tab through Apps Script. */
export async function addExpense(input: ExpenseInput): Promise<AddExpenseResult> {
  const session = await verifySessionToken((await cookies()).get(SESSION_COOKIE)?.value);
  if (!session) return { ok: false, error: "Your session has expired. Please sign in again." };

  const checked = validateExpense(input);
  if (!checked.ok) return { ok: false, error: "Please fix the highlighted fields.", fieldErrors: checked.errors };
  const e = checked.expense;

  const { url, key } = sheetConfig();
  if (!url) return { ok: false, demo: true, error: "This is demo data. Connect your Google Sheet to add expenses." };

  let text: string;
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ Type: "ManualExpense", Key: key, Amount: e.amount, Category: e.category, Remark: e.remark, Date: e.date.toISOString() }),
      redirect: "follow",
      cache: "no-store",
      signal: AbortSignal.timeout(25_000),
    });
    text = await res.text();
  } catch {
    return { ok: false, error: "Couldn't reach Google Apps Script. Try again in a moment." };
  }

  if (text.startsWith("Success")) return { ok: true };
  if (text.includes("Unknown transaction type")) {
    return { ok: false, error: "Your Apps Script is an older version. Paste the latest Code.gs and deploy a new version." };
  }
  if (text.includes("Unauthorized")) return { ok: false, error: "DASHBOARD_KEY doesn't match the key in Apps Script." };
  return { ok: false, error: text.startsWith("Error: ") ? text.slice(7) : "Couldn't save to your sheet." };
}

export type AddInvestmentResult = { ok: true } | { ok: false; error: string; fieldErrors?: InvestmentErrors; demo?: boolean };

/** Appends a manually entered investment to the Investments tab through Apps Script (v3 script and later). */
export async function addInvestment(input: InvestmentInput): Promise<AddInvestmentResult> {
  const session = await verifySessionToken((await cookies()).get(SESSION_COOKIE)?.value);
  if (!session) return { ok: false, error: "Your session has expired. Please sign in again." };

  const checked = validateInvestment(input);
  if (!checked.ok) return { ok: false, error: "Please fix the highlighted fields.", fieldErrors: checked.errors };
  const i = checked.investment;

  const { url, key } = sheetConfig();
  if (!url) return { ok: false, demo: true, error: "This is demo data. Connect your Google Sheet to add investments." };

  let text: string;
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        Type: "ManualInvestment",
        Key: key,
        Amount: i.amount,
        InvestmentType: i.type,
        Frequency: i.frequency,
        PaymentMethod: i.paymentMethod,
        Remark: i.remark,
        Date: i.date.toISOString(),
      }),
      redirect: "follow",
      cache: "no-store",
      signal: AbortSignal.timeout(25_000),
    });
    text = await res.text();
  } catch {
    return { ok: false, error: "Couldn't reach Google Apps Script. Try again in a moment." };
  }

  if (text.startsWith("Success")) return { ok: true };
  if (text.includes("Unknown transaction type")) {
    return { ok: false, error: "Your Apps Script doesn't know investments yet. Paste the latest Code.gs and deploy a new version." };
  }
  if (text.includes("Unauthorized")) return { ok: false, error: "DASHBOARD_KEY doesn't match the key in Apps Script." };
  return { ok: false, error: text.startsWith("Error: ") ? text.slice(7) : "Couldn't save to your sheet." };
}

export type AddEmiResult = { ok: true } | { ok: false; error: string; fieldErrors?: EmiErrors; demo?: boolean };

/** Appends an EMI to the EMI tab through Apps Script, the same row the Shortcut writes. */
export async function addEmi(input: EmiInput): Promise<AddEmiResult> {
  const session = await verifySessionToken((await cookies()).get(SESSION_COOKIE)?.value);
  if (!session) return { ok: false, error: "Your session has expired. Please sign in again." };

  const checked = validateEmi(input);
  if (!checked.ok) return { ok: false, error: "Please fix the highlighted fields.", fieldErrors: checked.errors };
  const e = checked.emi;

  const { url, key } = sheetConfig();
  if (!url) return { ok: false, demo: true, error: "This is demo data. Connect your Google Sheet to add EMIs." };

  let text: string;
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        Type: "EMI",
        Key: key,
        EMIName: e.name,
        Amount: e.amount,
        Tenure: e.tenure,
        StartDate: e.startDate,
        PaymentMethod: e.paymentMethod,
        CardName: e.cardName,
      }),
      redirect: "follow",
      cache: "no-store",
      signal: AbortSignal.timeout(25_000),
    });
    text = await res.text();
  } catch {
    return { ok: false, error: "Couldn't reach Google Apps Script. Try again in a moment." };
  }

  if (text.startsWith("Success")) return { ok: true };
  if (text.includes("Unauthorized")) return { ok: false, error: "DASHBOARD_KEY doesn't match the key in Apps Script." };
  return { ok: false, error: text.startsWith("Error: ") ? text.slice(7) : "Couldn't save to your sheet." };
}
