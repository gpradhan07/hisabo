import "server-only";
import { parseDate, tidyFrequency } from "@/lib/api";
import { EXPENSE_CATEGORIES } from "@/lib/categories";
import { validateEmi } from "@/lib/emi-input";
import { validateExpense } from "@/lib/expense-input";
import { FREQUENCIES, validateInvestment } from "@/lib/investment-input";
import { resolvePhoneKey, type PhoneKeyRepo } from "./phone-keys";
import { allow } from "./rate-limit";
import { needsReconnect, type NewEntry, type StoreLookup } from "./store";

/**
 * What the iOS Shortcut sends to /api/ingest: the same fields as the Apps Script (apps-script/Code.gs v4), so one
 * Shortcut layout works with either. Type: Expense, Subscription, Investment, EMI or EMIPayment.
 */

/** The lists the Shortcut offers (GET /api/ingest), for a Shortcut that loads them instead of having them typed in. */
export const SHORTCUT_LISTS = {
  categories: EXPENSE_CATEGORIES,
  paymentMethods: ["UPI (Debit Card)", "UPI (Credit Card)", "Cash", "Apple Wallet"],
  investmentTypes: ["Mutual Fund", "Stocks", "SIP", "FD", "RD", "Gold", "PPF", "Crypto", "Others"],
  frequencies: FREQUENCIES.map((f) => f.value),
};

const text = (v: unknown) => (v === undefined || v === null ? "" : String(v).trim());

/** 250, "250", "1,250.50", "₹250", "Rs. 250" → a number (NaN when there's none), like Code.gs. */
export function parseAmount(v: unknown): number {
  if (typeof v === "number") return v;
  const m = text(v).match(/-?\d[\d,]*(?:\.\d+)?/);
  return m ? Number(m[0].replace(/,/g, "")) : NaN;
}

const ymd = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const firstError = (errors: Record<string, string | undefined>) => Object.values(errors).find(Boolean) ?? "Check the entry and try again.";
const EARLIEST = new Date(2000, 0, 1);

/** "SIP", "monthly", "one time"… → the Frequency values the Investments tab uses. */
function frequency(v: unknown): string {
  const f = tidyFrequency(text(v));
  return f === "One-time" ? "One-Time" : f;
}

/** The first problem with the amount, date or a too-long field, or null when they're fine. */
function basics(amount: number, date: Date, now: Date, limits: [string, number][]): string | null {
  if (!Number.isFinite(amount) || amount <= 0) return "Enter an amount above 0.";
  if (amount >= 1e9) return "That amount looks too large.";
  if (date.getTime() > now.getTime() + 10 * 60_000) return "The date can't be in the future.";
  if (date < EARLIEST) return "That date is too far back.";
  for (const [value, max] of limits) if (value.length > max) return `Keep "${value.slice(0, 20)}…" under ${max} characters.`;
  return null;
}

export type ParsedIngest = { ok: true; entry: NewEntry } | { ok: false; error: string };

export function parseIngest(body: unknown, now = new Date()): ParsedIngest {
  if (!body || typeof body !== "object" || Array.isArray(body)) return { ok: false, error: "hisabo expected the entry as JSON." };
  const b = body as Record<string, unknown>;
  // "EMI Payment", "emi_payment" and "EMIPayment" all mean the same thing.
  const type = text(b.Type || "Expense").toLowerCase().replace(/[\s_-]/g, "");
  const amount = parseAmount(b.Amount);
  const paymentMethod = text(b.PaymentMethod || b.PaymentMode || b.Payment);
  const cardName = text(b.CardName);
  const remark = text(b.Remark);

  // No date means "now"; the Shortcut may send one to back-date an entry.
  let date = now;
  if (text(b.Date)) {
    const parsed = parseDate(text(b.Date));
    if (!parsed) return { ok: false, error: "hisabo couldn't read that date." };
    date = parsed;
  }
  const fail = (error: string): ParsedIngest => ({ ok: false, error });

  if (type === "expense" || type === "manualexpense") {
    const merchant = text(b.Merchant);
    if (paymentMethod.length > 30 || cardName.length > 40 || merchant.length > 60) return fail("The payment method, card or place is too long.");
    const v = validateExpense({ amount, category: text(b.Category), remark, date: date.toISOString() }, now);
    if (!v.ok) return fail(firstError(v.errors));
    return {
      ok: true,
      entry: { kind: "expense", ...v.expense, ...(paymentMethod ? { paymentMethod } : {}), ...(cardName ? { cardName } : {}), ...(merchant ? { merchant } : {}) },
    };
  }

  if (type === "subscription") {
    const name = text(b.Name || b.SubscriptionName);
    if (!name) return fail("Name the subscription.");
    const freq = tidyFrequency(text(b.Frequency) || "Monthly");
    const problem = basics(amount, date, now, [[name, 60], [paymentMethod, 30], [cardName, 40], [remark, 100]]);
    if (problem) return fail(problem);
    // One-time payments never renew; otherwise renewal is on unless the Shortcut says "No".
    const autoRenew = freq !== "One-time" && !/^(n|no|false|0)$/i.test(text(b.AutoRenew));
    return { ok: true, entry: { kind: "subscription", amount: Math.round(amount * 100) / 100, name, frequency: freq, autoRenew, date, paymentMethod, cardName, remark } };
  }

  if (type === "emi") {
    const start = parseDate(text(b.StartDate), true);
    const v = validateEmi({ name: text(b.EMIName), amount, tenure: text(b.Tenure), startDate: start ? ymd(start) : "", paymentMethod, cardName }, now);
    if (!v.ok) return fail(firstError(v.errors));
    const paidBefore = text(b.PaidBefore) === "" ? 0 : Number(text(b.PaidBefore));
    if (!Number.isInteger(paidBefore) || paidBefore < 0 || paidBefore > v.emi.tenure) return fail(`Instalments already paid must be a whole number from 0 to ${v.emi.tenure}.`);
    const emiType = text(b.EMIType);
    if (emiType.length > 30 || remark.length > 100) return fail("The EMI type or remark is too long.");
    return { ok: true, entry: { kind: "emi", ...v.emi, type: emiType, paidBefore, remark } };
  }

  if (type === "emipayment") {
    const emiName = text(b.EMIName);
    if (!emiName) return fail("Say which EMI this payment is for.");
    const problem = basics(amount, date, now, [[emiName, 40], [paymentMethod, 30], [cardName, 40], [remark, 100]]);
    if (problem) return fail(problem);
    return { ok: true, entry: { kind: "emiPayment", amount: Math.round(amount * 100) / 100, emiName, date, paymentMethod, cardName, remark } };
  }

  if (type === "investment" || type === "manualinvestment") {
    const name = text(b.InvestmentName || b.Name);
    const platform = text(b.Platform);
    if (name.length > 60 || platform.length > 30 || cardName.length > 40) return fail("The investment name, platform or card is too long.");
    const v = validateInvestment(
      { amount, type: text(b.InvestmentType || b.Category), frequency: frequency(b.Frequency), paymentMethod, remark, date: date.toISOString() },
      now,
    );
    if (!v.ok) return fail(firstError(v.errors));
    return { ok: true, entry: { kind: "investment", ...v.investment, name, platform, cardName } };
  }

  return fail(`hisabo doesn't know the entry type "${text(b.Type)}". Use Expense, Subscription, Investment, EMI or EMIPayment.`);
}

/** The Shortcut shows this reply as is, so it reads like a receipt. Every success starts with "Saved". */
export function savedMessage(entry: NewEntry, currency: string): string {
  const money = (n: number) => new Intl.NumberFormat("en-IN", { style: "currency", currency }).format(n);
  switch (entry.kind) {
    case "expense":
      return `Saved ${money(entry.amount)} · ${entry.category}`;
    case "subscription":
      return `Saved ${money(entry.amount)} · ${entry.name} (${entry.frequency})`;
    case "emi":
      return `Saved EMI · ${entry.name} · ${money(entry.amount)} a month for ${entry.tenure} months`;
    case "emiPayment":
      return `Saved payment · ${entry.emiName} · ${money(entry.amount)}`;
    case "investment":
      return `Saved ${money(entry.amount)} · ${entry.type} (${entry.frequency})`;
  }
}

// ─── The /api/ingest request ──────────────────────────────────


export interface IngestDeps {
  phoneKeys: PhoneKeyRepo;
  storeForUser: (uid: string) => Promise<StoreLookup>;
  markDriveLost: (uid: string) => Promise<void>;
  currency: string;
  /** tells the user's open dashboards to reload (lib/server/live.ts) */
  notify?: (uid: string) => Promise<void>;
}

export interface IngestRequest {
  method: "GET" | "POST";
  authorization: string | null;
  ip: string;
  /** POST only */
  body?: string;
}

export type IngestReply = { status: number; text: string } | { status: number; json: unknown };

const MAX_BODY = 10_000;
export const NOT_PAIRED = "This iPhone isn't paired. Open hisabo → Add to iPhone.";
const DRIVE_GONE = "hisabo can't reach your Google Drive. Open hisabo to reconnect it.";

/** Plain-text replies for POST (the Shortcut shows them as is); JSON for the GET lists. */
export async function handleIngest(deps: IngestDeps, req: IngestRequest): Promise<IngestReply> {
  const fail = (status: number, message: string): IngestReply => (req.method === "GET" ? { status, json: { error: message } } : { status, text: message });

  // Checked before the key lookup, so guessing keys can't run up Firestore reads.
  if (!allow(`ingest-ip:${req.ip}`, 120, 60_000)) return fail(429, "Too many requests, try again in a minute.");
  const key = req.authorization?.match(/^Bearer\s+(\S+)$/i)?.[1] ?? "";
  const phone = key ? await resolvePhoneKey(deps.phoneKeys, key) : null;
  if (!phone) return fail(401, NOT_PAIRED);
  if (!allow(`ingest-key:${phone.id}`, 30, 60_000)) return fail(429, "Too many requests, try again in a minute.");

  if (req.method === "GET") return { status: 200, json: SHORTCUT_LISTS };

  const raw = req.body ?? "";
  if (raw.length > MAX_BODY) return fail(413, "That's too much for one entry.");
  let body: unknown;
  try {
    body = JSON.parse(raw);
  } catch {
    return fail(400, "hisabo expected the entry as JSON. In the Shortcut, set Request Body to JSON.");
  }
  const parsed = parseIngest(body);
  if (!parsed.ok) return fail(400, parsed.error);

  const found = await deps.storeForUser(phone.uid);
  if (!found.ok) return fail(409, DRIVE_GONE);
  const saved = await found.store.append(parsed.entry);
  if (!saved.ok) {
    if (needsReconnect(saved.code)) {
      await deps.markDriveLost(phone.uid);
      return fail(409, DRIVE_GONE);
    }
    return fail(502, saved.error);
  }
  await deps.notify?.(phone.uid);
  return { status: 200, text: savedMessage(parsed.entry, deps.currency) };
}
