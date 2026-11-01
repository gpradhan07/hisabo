"use server";

import { cookies } from "next/headers";
import { validateEmi, type EmiErrors, type EmiInput } from "@/lib/emi-input";
import { validateExpense, type ExpenseErrors, type ExpenseInput } from "@/lib/expense-input";
import { validateInvestment, type InvestmentErrors, type InvestmentInput } from "@/lib/investment-input";
import { validateProfile, type ProfileErrors, type ProfileInput } from "@/lib/profile";
import { hostedConfig } from "@/lib/server/config";
import { deleteAccount } from "@/lib/server/delete-account";
import { hostedServices } from "@/lib/server/hosted";
import { signalChange } from "@/lib/server/live";
import { allow } from "@/lib/server/rate-limit";
import { SESSION_COOKIE, verifySessionToken } from "@/lib/server/session";
import { markDriveLost, needsReconnect, storeFor, type NewEntry, type RowRef, type Store, type WriteResult } from "@/lib/server/store";
import type { Profile } from "@/lib/types";

const EXPIRED = "Your session has expired. Please sign in again.";
const FIX_FIELDS = "Please fix the highlighted fields.";

/** `connect-drive`: hosted mode lost Google Drive access; the dashboard sends the user to reconnect. */
type Failure = { ok: false; error: string; demo?: boolean; code?: "connect-drive" };

/** Runs a write against the signed-in user's store. */
async function write(run: (store: Store) => Promise<WriteResult>): Promise<{ ok: true } | Failure> {
  const session = await verifySessionToken((await cookies()).get(SESSION_COOKIE)?.value);
  if (!session) return { ok: false, error: EXPIRED };
  const found = await storeFor(session);
  if (!found.ok) return { ok: false, error: found.error, code: "connect-drive" };

  const res = await run(found.store);
  if (res.ok) {
    // This dashboard reloads by itself; the signal is for the user's other open ones (phone, laptop).
    const config = hostedConfig();
    if (config && session.kind === "hosted") await signalChange(hostedServices(config).signals, session.uid);
    return res;
  }
  if (needsReconnect(res.code)) {
    await markDriveLost(session);
    return { ok: false, error: res.error, code: "connect-drive" };
  }
  return { ok: false, error: res.error, ...(res.demo ? { demo: true } : {}) };
}

const signedIn = async () => !!(await verifySessionToken((await cookies()).get(SESSION_COOKIE)?.value));
const append = (entry: NewEntry) => write((store) => store.append(entry));

export type SaveProfileResult = { ok: true; profile: Profile } | (Failure & { fieldErrors?: ProfileErrors });

/** Saves the profile into the sheet's "Profile" tab. */
export async function saveProfile(input: ProfileInput): Promise<SaveProfileResult> {
  if (!(await signedIn())) return { ok: false, error: EXPIRED };

  const checked = validateProfile(input);
  if (!checked.ok) return { ok: false, error: FIX_FIELDS, fieldErrors: checked.errors };

  const saved = await write((store) => store.saveProfile(checked.profile));
  return saved.ok ? { ok: true, profile: checked.profile } : saved;
}

export type AddExpenseResult = { ok: true } | (Failure & { fieldErrors?: ExpenseErrors });

/** Appends a manually entered (possibly back-dated) expense to the Expenses tab. */
export async function addExpense(input: ExpenseInput): Promise<AddExpenseResult> {
  if (!(await signedIn())) return { ok: false, error: EXPIRED };

  const checked = validateExpense(input);
  if (!checked.ok) return { ok: false, error: FIX_FIELDS, fieldErrors: checked.errors };

  return append({ kind: "expense", ...checked.expense });
}

export type AddInvestmentResult = { ok: true } | (Failure & { fieldErrors?: InvestmentErrors });

/** Appends a manually entered investment to the Investments tab. */
export async function addInvestment(input: InvestmentInput): Promise<AddInvestmentResult> {
  if (!(await signedIn())) return { ok: false, error: EXPIRED };

  const checked = validateInvestment(input);
  if (!checked.ok) return { ok: false, error: FIX_FIELDS, fieldErrors: checked.errors };

  return append({ kind: "investment", ...checked.investment });
}

export type AddEmiResult = { ok: true } | (Failure & { fieldErrors?: EmiErrors });

/** Appends an EMI to the EMI tab, the same row the Shortcut writes. */
export async function addEmi(input: EmiInput): Promise<AddEmiResult> {
  if (!(await signedIn())) return { ok: false, error: EXPIRED };

  const checked = validateEmi(input);
  if (!checked.ok) return { ok: false, error: FIX_FIELDS, fieldErrors: checked.errors };

  return append({ kind: "emi", ...checked.emi });
}

/** The tab behind each dashboard ID prefix: `e12` is Expenses row 12, `m2` EMI row 2, and so on. */
const TAB_FOR_ID: Record<string, RowRef["tab"]> = { e: "expenses", s: "subscriptions", i: "investments", m: "emis", p: "emiPayments" };

export type DeleteItem = { id: string; amount: number; date?: string | null; name?: string };

/** Deletes rows the dashboard showed (an expense, an investment, an EMI with its payments…): all of them or none. */
export async function deleteEntries(items: DeleteItem[]): Promise<{ ok: true } | Failure> {
  if (!(await signedIn())) return { ok: false, error: EXPIRED };
  const unclear = { ok: false as const, error: "hisabo couldn't tell which entry to delete. Refresh and try again." };
  const refs: RowRef[] = [];
  for (const item of Array.isArray(items) ? items.slice(0, 500) : []) {
    const m = /^([esimp])(\d+)$/.exec(String(item?.id ?? ""));
    const tab = m ? TAB_FOR_ID[m[1]] : undefined;
    const amount = Number(item?.amount);
    const date = item?.date ? new Date(String(item.date)) : null;
    const name = typeof item?.name === "string" && item.name.trim() ? item.name : undefined;
    if (!m || !tab || !Number.isFinite(amount)) return unclear;
    // An EMI is matched by its name; every other row by its date.
    if (tab === "emis" ? !name : !date || Number.isNaN(date.getTime())) return unclear;
    refs.push({ tab, row: Number(m[2]), amount, date: date?.toISOString() ?? null, ...(name ? { name } : {}) });
  }
  if (!refs.length) return unclear;
  return write((store) => store.remove(refs));
}

/** Hosted mode: deletes the account and everything hisabo keeps for it (see delete-account.ts), then signs out. */
export async function deleteMyAccount(): Promise<{ ok: true; sheetRemoved: boolean } | { ok: false; error: string }> {
  const jar = await cookies();
  const session = await verifySessionToken(jar.get(SESSION_COOKIE)?.value);
  const config = hostedConfig();
  if (!config || session?.kind !== "hosted") return { ok: false, error: EXPIRED };
  if (!allow(`delete-account:${session.uid}`, 3, 10 * 60_000)) return { ok: false, error: "Wait a few minutes and try again." };
  try {
    const { sheetRemoved } = await deleteAccount(hostedServices(config), session.uid);
    jar.delete(SESSION_COOKIE);
    return { ok: true, sheetRemoved };
  } catch {
    return { ok: false, error: "Deleting your account didn't finish. Try again in a moment." };
  }
}

/** Edits an expense (`e12`: Expenses row 12) after checking it's still the one the dashboard showed. */
export async function updateExpense(original: { id: string; date: string; amount: number }, input: ExpenseInput): Promise<AddExpenseResult> {
  if (!(await signedIn())) return { ok: false, error: EXPIRED };
  const m = /^e(\d+)$/.exec(String(original?.id ?? ""));
  const date = new Date(String(original?.date ?? ""));
  const amount = Number(original?.amount);
  if (!m || Number.isNaN(date.getTime()) || !Number.isFinite(amount)) return { ok: false, error: "hisabo couldn't tell which expense to edit. Refresh and try again." };

  const checked = validateExpense(input);
  if (!checked.ok) return { ok: false, error: FIX_FIELDS, fieldErrors: checked.errors };
  return write((store) => store.update({ tab: "expenses", row: Number(m[1]), date: date.toISOString(), amount }, checked.expense));
}

/** "Stop SIP" (stop: true, from today) or "Resume" (stop: false) on a plan, saved in its latest row in the sheet. */
export async function setInvestmentStopped(latest: { id: string; date: string; amount: number }, stop: boolean): Promise<{ ok: true } | Failure> {
  if (!(await signedIn())) return { ok: false, error: EXPIRED };
  const m = /^i(\d+)$/.exec(String(latest?.id ?? ""));
  const date = new Date(String(latest?.date ?? ""));
  const amount = Number(latest?.amount);
  if (!m || Number.isNaN(date.getTime()) || !Number.isFinite(amount)) return { ok: false, error: "hisabo couldn't tell which plan this is. Refresh and try again." };
  return write((store) => store.stopInvestment({ tab: "investments", row: Number(m[1]), date: date.toISOString(), amount }, stop ? new Date() : null));
}
