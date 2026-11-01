import type { ValidEmi } from "@/lib/emi-input";
import type { ValidExpense } from "@/lib/expense-input";
import type { ValidInvestment } from "@/lib/investment-input";
import type { ApiResponse, Profile } from "@/lib/types";

/** Everything the dashboard reads from a spreadsheet, in the row shape the Apps Script doGet returns. */
export interface SheetData {
  expenses: NonNullable<ApiResponse["expenses"]>;
  subscriptions: NonNullable<ApiResponse["subscriptions"]>;
  emis: NonNullable<ApiResponse["emis"]>;
  emiPayments: NonNullable<ApiResponse["emiPayments"]>;
  investments: NonNullable<ApiResponse["investments"]>;
  profile: Profile | null;
}

/**
 * Why a Google call failed, when the app should react to it:
 * `reauth` → the Google grant was revoked or expired (show Connect Google Drive);
 * `sheet-missing` → the spreadsheet was deleted or hisabo lost access to it.
 */
export type StoreErrorCode = "reauth" | "sheet-missing";

export type StoreFailure = { ok: false; status: number; error: string; code?: StoreErrorCode };

export type LoadResult = ({ ok: true; demo: boolean; version: string; generatedAt: string } & SheetData) | StoreFailure;

/** One subscription payment (Netflix, a gym…). */
export interface SubscriptionEntry {
  amount: number;
  name: string;
  /** Weekly, Monthly, Quarterly, Yearly or One-time */
  frequency: string;
  autoRenew: boolean;
  date: Date;
  paymentMethod: string;
  cardName: string;
  remark: string;
}

/** A monthly instalment paid towards an EMI that already exists. */
export interface EmiPaymentEntry {
  amount: number;
  emiName: string;
  date: Date;
  paymentMethod: string;
  cardName: string;
  remark: string;
}

/** A validated entry, ready to append. The Shortcut sends a few more fields than the dashboard forms. */
export type NewEntry =
  | ({ kind: "expense" } & ValidExpense & { paymentMethod?: string; cardName?: string; merchant?: string })
  | ({ kind: "subscription" } & SubscriptionEntry)
  | ({ kind: "emi" } & ValidEmi & { type?: string; paidBefore?: number; remark?: string })
  | ({ kind: "emiPayment" } & EmiPaymentEntry)
  | ({ kind: "investment" } & ValidInvestment & { name?: string; platform?: string; cardName?: string });

export type WriteResult = { ok: true } | { ok: false; error: string; demo?: boolean; code?: StoreErrorCode };

/**
 * One row the dashboard shows, by tab and row number. The rest confirm it's still that row: date (ISO) and amount,
 * plus the EMI's name for EMI rows (an EMI is matched by name and monthly amount; its "date added" may be blank).
 */
export interface RowRef {
  tab: "expenses" | "subscriptions" | "investments" | "emis" | "emiPayments";
  row: number;
  amount: number;
  date?: string | null;
  name?: string;
}

/** Where a user's expenses, EMIs, investments and profile live. */
export interface Store {
  load(): Promise<LoadResult>;
  append(entry: NewEntry): Promise<WriteResult>;
  saveProfile(profile: Profile): Promise<WriteResult>;
  /** Deletes all of these rows (any tabs), or none of them if one isn't there anymore. */
  remove(refs: RowRef[]): Promise<WriteResult>;
  /** Rewrites an expense's date, amount, category and note; how it was paid stays as the Shortcut sent it. */
  update(ref: RowRef & { tab: "expenses" }, next: ValidExpense): Promise<WriteResult>;
  /** Stops a recurring investment from `stoppedOn` (saved in its latest row), or resumes it with `null`. */
  stopInvestment(ref: RowRef & { tab: "investments" }, stoppedOn: Date | null): Promise<WriteResult>;
}
