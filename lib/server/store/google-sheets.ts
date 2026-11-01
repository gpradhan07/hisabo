import "server-only";
import { normalizeProfile } from "@/lib/profile";
import type { Profile } from "@/lib/types";
import { isValidTimeZone, serialToIso, toSheetDateTime } from "./sheet-time";
import type { ValidExpense } from "@/lib/expense-input";
import type { LoadResult, NewEntry, RowRef, SheetData, Store, StoreErrorCode, StoreFailure, WriteResult } from "./types";
import { dataVersion } from "./version";

/**
 * Hosted mode (v2): talks to the user's own spreadsheet with the Sheets API, using a Google access token
 * limited to `drive.file` (files hisabo created). Rows match what apps-script/Code.gs writes and reads,
 * so a sheet works the same in either mode.
 */

const SHEETS_API = "https://sheets.googleapis.com/v4/spreadsheets";

type Cell = string | number | boolean;
type Tab = { title: string; headers: readonly string[]; width: string };

export const TABS = {
  expenses: { title: "Expenses", headers: ["Date", "Amount", "Category", "Remark", "Payment Method", "Card Name", "Merchant"], width: "G" },
  subscriptions: {
    title: "Subscriptions",
    headers: ["Date", "Amount", "Name", "Frequency", "Auto Renew", "Payment Method", "Card Name", "Remark"],
    width: "H",
  },
  emis: {
    title: "EMI",
    headers: ["Date Added", "EMI Name", "Monthly EMI", "Tenure (Months)", "Total Payable", "Start Date", "Payment Method", "Card Name", "EMI Type", "Paid Before", "Remark"],
    width: "K",
  },
  emiPayments: { title: "EMI Payments", headers: ["Date", "EMI Name", "Amount", "Payment Method", "Card Name", "Remark"], width: "F" },
  investments: {
    title: "Investments",
    headers: ["Date", "Amount", "Investment Type", "Frequency", "Payment Method", "Remark", "Investment Name", "Platform", "Card Name", "Stopped On"],
    width: "J",
  },
  profile: { title: "Profile", headers: ["Field", "Value"], width: "B" },
} as const satisfies Record<string, Tab>;

const TAB_FOR: Record<NewEntry["kind"], Tab> = {
  expense: TABS.expenses,
  subscription: TABS.subscriptions,
  emi: TABS.emis,
  emiPayment: TABS.emiPayments,
  investment: TABS.investments,
};

/** Profile tab rows, in the same order and wording as Code.gs. */
const PROFILE_FIELDS: readonly [keyof Profile, string][] = [
  ["name", "Name"],
  ["email", "Email"],
  ["monthlyIncome", "Monthly income"],
  ["monthlyBudget", "Monthly budget"],
  ["payday", "Payday (day of month)"],
];

/** Returns a valid access token; `refresh: true` asks for a new one after Google rejected the last. */
export type AccessTokenSource = (opts?: { refresh?: boolean }) => Promise<string>;

export interface GoogleSheetsOptions {
  spreadsheetId: string;
  accessToken: AccessTokenSource;
  fetch?: typeof fetch;
}

/** Thrown by an AccessTokenSource when the user removed hisabo's Google access (the refresh token is dead). */
export class ReauthRequiredError extends Error {
  constructor() {
    super("Google access was removed.");
  }
}

class GoogleApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

/** One Sheets API client per request; retries once with a fresh token when Google says the token expired. */
class SheetsApi {
  constructor(
    private readonly accessToken: AccessTokenSource,
    private readonly fetchImpl: typeof fetch,
  ) {}

  async call<T>(method: "GET" | "POST" | "PUT", url: string, body?: unknown): Promise<T> {
    let res = await this.send(method, url, body, await this.accessToken());
    if (res.status === 401) res = await this.send(method, url, body, await this.accessToken({ refresh: true }));
    const text = await res.text();
    let json: unknown = undefined;
    try {
      json = text ? JSON.parse(text) : {};
    } catch {
      // not JSON: handled below
    }
    if (!res.ok) {
      const message = (json as { error?: { message?: string } } | undefined)?.error?.message ?? `Google Sheets responded with ${res.status}.`;
      throw new GoogleApiError(res.status, message);
    }
    if (json === undefined) throw new GoogleApiError(502, "Google Sheets sent an unreadable reply.");
    return json as T;
  }

  private async send(method: string, url: string, body: unknown, token: string) {
    try {
      return await this.fetchImpl(url, {
        method,
        headers: { Authorization: `Bearer ${token}`, ...(body === undefined ? {} : { "Content-Type": "application/json" }) },
        body: body === undefined ? undefined : JSON.stringify(body),
        cache: "no-store",
        signal: AbortSignal.timeout(20_000),
      });
    } catch (err) {
      const timedOut = (err as Error).name === "TimeoutError";
      throw new GoogleApiError(timedOut ? 504 : 502, timedOut ? "Google Sheets took too long to respond." : "Couldn't reach Google Sheets.");
    }
  }
}

/** Turns a Google error into the message the user sees. */
function failure(err: unknown): StoreFailure {
  const fail = (status: number, error: string, code?: StoreErrorCode): StoreFailure => ({ ok: false, status, error, ...(code ? { code } : {}) });
  const reauth = () => fail(401, "hisabo no longer has access to your Google account. Connect Google Drive again.", "reauth");
  if (err instanceof ReauthRequiredError) return reauth();
  // The access token couldn't be refreshed for another reason (network, Google outage).
  if (err instanceof Error && err.name === "GoogleTokenError") return fail(502, "Couldn't reach Google. Try again in a moment.");
  if (!(err instanceof GoogleApiError)) throw err;
  switch (err.status) {
    case 401:
      return reauth();
    case 403:
    case 404:
      return fail(404, "hisabo can't open your spreadsheet. It may have been deleted, or access to it was removed.", "sheet-missing");
    case 429:
      return fail(429, "Google Sheets is busy. Try again in a minute.");
    case 502:
    case 504:
      return fail(err.status, err.message);
    default:
      return fail(502, `Google Sheets error: ${err.message}`);
  }
}

const isMissingTab = (err: unknown) => err instanceof GoogleApiError && err.status === 400 && /Unable to parse range/i.test(err.message);
const isDuplicateTab = (err: unknown) => err instanceof GoogleApiError && err.status === 400 && /already exists/i.test(err.message);

const range = (tab: Tab, cells = `A:${tab.width}`) => `'${tab.title}'!${cells}`;
const clean = (v: unknown) => String(v ?? "").trim();
/** Text is written with a leading apostrophe so Sheets stores it as typed (no formulas, no auto-converted dates). */
const text = (v: string | undefined) => (v ? `'${v}` : "");
const money = (n: number) => Math.round(n * 100) / 100;

/** The ISO time of a date cell. Text that parses as a date is accepted too, as in Code.gs. */
function cellIso(v: Cell | undefined, timeZone: string): string | null {
  if (typeof v === "number") return serialToIso(v, timeZone);
  if (typeof v === "string" && v) {
    const d = new Date(v);
    if (!Number.isNaN(d.getTime())) return d.toISOString();
  }
  return null;
}

const amountCell = (v: Cell | undefined): number | string => (typeof v === "number" ? v : clean(v));
const GONE = { ok: false as const, error: "That entry isn't in your sheet anymore. Refresh to see the latest." };

/** Which columns identify a row in each tab (0 = A). An EMI's "date added" may be blank, so it's matched by name. */
const MATCH: Record<RowRef["tab"], { amount: number; date?: number; name?: number }> = {
  expenses: { date: 0, amount: 1 },
  subscriptions: { date: 0, amount: 1 },
  investments: { date: 0, amount: 1 },
  emiPayments: { date: 0, name: 1, amount: 2 },
  emis: { name: 1, amount: 2 },
};
/** "₹1,250.50" typed into the sheet → 1250.5, like the dashboard reads it */
const amountOf = (v: Cell | undefined) => (typeof v === "number" ? v : Number(clean(v).replace(/[^\d.-]/g, "")));

function readExpenses(rows: Cell[][], tz: string): SheetData["expenses"] {
  const out: SheetData["expenses"] = [];
  rows.forEach((r, i) => {
    const date = cellIso(r[0], tz);
    if (!date || r[1] === undefined || r[1] === "") return;
    out.push({
      row: i + 1,
      date,
      amount: amountCell(r[1]),
      category: clean(r[2]),
      remark: clean(r[3]),
      paymentMethod: clean(r[4]),
      cardName: clean(r[5]),
      merchant: clean(r[6]),
    });
  });
  return out;
}

function readSubscriptions(rows: Cell[][], tz: string): SheetData["subscriptions"] {
  const out: SheetData["subscriptions"] = [];
  rows.forEach((r, i) => {
    if (i === 0 || !r[2] || r[1] === undefined || r[1] === "") return;
    out.push({
      row: i + 1,
      date: cellIso(r[0], tz),
      amount: amountCell(r[1]),
      name: clean(r[2]),
      frequency: clean(r[3]),
      autoRenew: clean(r[4]),
      paymentMethod: clean(r[5]),
      cardName: clean(r[6]),
      remark: clean(r[7]),
    });
  });
  return out;
}

function readEmis(rows: Cell[][], tz: string): SheetData["emis"] {
  const out: SheetData["emis"] = [];
  rows.forEach((r, i) => {
    if (i === 0 || !r[1]) return;
    out.push({
      row: i + 1,
      addedOn: cellIso(r[0], tz),
      name: clean(r[1]),
      monthly: amountCell(r[2]),
      tenure: amountCell(r[3]),
      total: amountCell(r[4]),
      startDate: typeof r[5] === "number" ? serialToIso(r[5], tz) : clean(r[5]),
      paymentMethod: clean(r[6]),
      cardName: clean(r[7]),
      emiType: clean(r[8]),
      paidBefore: amountCell(r[9]),
      remark: clean(r[10]),
    });
  });
  return out;
}

function readEmiPayments(rows: Cell[][], tz: string): SheetData["emiPayments"] {
  const out: SheetData["emiPayments"] = [];
  rows.forEach((r, i) => {
    if (i === 0 || !r[1] || r[2] === undefined || r[2] === "") return;
    out.push({
      row: i + 1,
      date: cellIso(r[0], tz),
      emiName: clean(r[1]),
      amount: amountCell(r[2]),
      paymentMethod: clean(r[3]),
      cardName: clean(r[4]),
      remark: clean(r[5]),
    });
  });
  return out;
}

function readInvestments(rows: Cell[][], tz: string): SheetData["investments"] {
  const out: SheetData["investments"] = [];
  rows.forEach((r, i) => {
    if (i === 0 || r[1] === undefined || r[1] === "") return;
    out.push({
      row: i + 1,
      date: cellIso(r[0], tz),
      amount: amountCell(r[1]),
      investmentType: clean(r[2]),
      frequency: clean(r[3]),
      paymentMethod: clean(r[4]),
      remark: clean(r[5]),
      investmentName: clean(r[6]),
      platform: clean(r[7]),
      cardName: clean(r[8]),
      ...(cellIso(r[9], tz) ? { stoppedOn: cellIso(r[9], tz) } : {}),
    });
  });
  return out;
}

function readProfile(rows: Cell[][]): Profile | null {
  const byLabel = new Map(rows.slice(1).map((r) => [clean(r[0]).toLowerCase(), r[1]] as const));
  const raw: Record<string, Cell> = {};
  for (const [key, label] of PROFILE_FIELDS) {
    const v = byLabel.get(label.toLowerCase());
    if (v !== undefined && v !== "") raw[key] = v;
  }
  return normalizeProfile(raw);
}

function rowFor(entry: NewEntry, tz: string, now: Date): Cell[] {
  switch (entry.kind) {
    case "expense":
      return [toSheetDateTime(entry.date, tz), entry.amount, text(entry.category), text(entry.remark), text(entry.paymentMethod), text(entry.cardName), text(entry.merchant)];
    case "subscription":
      return [toSheetDateTime(entry.date, tz), entry.amount, text(entry.name), text(entry.frequency), entry.autoRenew ? "Yes" : "No", text(entry.paymentMethod), text(entry.cardName), text(entry.remark)];
    case "emi":
      // The start date stays unquoted so Sheets turns "2026-03-05" into a real date, as Apps Script does.
      return [
        toSheetDateTime(now, tz),
        text(entry.name),
        entry.amount,
        entry.tenure,
        money(entry.amount * entry.tenure),
        entry.startDate,
        text(entry.paymentMethod),
        text(entry.cardName),
        text(entry.type),
        entry.paidBefore ?? 0,
        text(entry.remark),
      ];
    case "emiPayment":
      return [toSheetDateTime(entry.date, tz), text(entry.emiName), entry.amount, text(entry.paymentMethod), text(entry.cardName), text(entry.remark)];
    case "investment":
      return [toSheetDateTime(entry.date, tz), entry.amount, text(entry.type), text(entry.frequency), text(entry.paymentMethod), text(entry.remark), text(entry.name), text(entry.platform), text(entry.cardName)];
  }
}

const headerRow = (headers: readonly string[]) => ({
  values: headers.map((h) => ({ userEnteredValue: { stringValue: h }, userEnteredFormat: { textFormat: { bold: true } } })),
});

interface Meta {
  properties: { timeZone: string };
  sheets?: { properties: { sheetId: number; title: string } }[];
}

export class GoogleSheetsStore implements Store {
  private readonly api: SheetsApi;
  private readonly base: string;
  private meta: Meta | null = null;

  constructor(opts: GoogleSheetsOptions) {
    this.api = new SheetsApi(opts.accessToken, opts.fetch ?? fetch);
    this.base = `${SHEETS_API}/${encodeURIComponent(opts.spreadsheetId)}`;
  }

  /**
   * Finds the rows the dashboard showed, checking each one's identity (`MATCH`): if rows moved since the dashboard
   * loaded (another one was deleted), it finds the entry where it is now. Null when any of them is gone.
   */
  private async locate(refs: RowRef[]): Promise<{ ref: RowRef; index: number; sheetId: number }[] | null> {
    const meta = await this.loadMeta();
    const tz = meta.properties.timeZone;
    const found: { ref: RowRef; index: number; sheetId: number }[] = [];
    for (const tabKey of new Set(refs.map((r) => r.tab))) {
      const tab = TABS[tabKey];
      const sheetId = meta.sheets?.find((s) => s.properties.title === tab.title)?.properties.sheetId;
      if (sheetId === undefined) return null;
      const params = new URLSearchParams({ valueRenderOption: "UNFORMATTED_VALUE", dateTimeRenderOption: "SERIAL_NUMBER" });
      const res = await this.api.call<{ values?: Cell[][] }>("GET", `${this.base}/values/${encodeURIComponent(range(tab, "A:C"))}?${params}`);
      const rows = res.values ?? [];
      const taken = new Set<number>();
      for (const ref of refs.filter((r) => r.tab === tabKey)) {
        const keys = MATCH[tabKey];
        const same = (r: Cell[] | undefined, i: number) => {
          if (!r || i < 1 || taken.has(i) || Math.abs(amountOf(r[keys.amount]) - ref.amount) >= 0.005) return false;
          if (keys.name !== undefined && ref.name !== undefined && clean(r[keys.name]).toLowerCase() !== ref.name.trim().toLowerCase()) return false;
          if (keys.date === undefined || !ref.date) return true;
          const iso = cellIso(r[keys.date], tz);
          return !!iso && new Date(iso).getTime() === new Date(ref.date).getTime();
        };
        const index = same(rows[ref.row - 1], ref.row - 1) ? ref.row - 1 : rows.findIndex(same);
        if (index < 0) return null;
        taken.add(index);
        found.push({ ref, index, sheetId });
      }
    }
    return found;
  }

  /** Deletes the rows in one batch (so all or none), after checking each is still the entry the dashboard showed. */
  async remove(refs: RowRef[]): Promise<WriteResult> {
    if (!refs.length) return { ok: true };
    try {
      const at = await this.locate(refs);
      if (!at) return GONE;
      // Bottom-up within each tab, so deleting one row doesn't shift the next.
      const requests = [...at]
        .sort((a, b) => a.sheetId - b.sheetId || b.index - a.index)
        .map(({ sheetId, index }) => ({ deleteDimension: { range: { sheetId, dimension: "ROWS", startIndex: index, endIndex: index + 1 } } }));
      await this.api.call("POST", `${this.base}:batchUpdate`, { requests });
      return { ok: true };
    } catch (err) {
      return failure(err);
    }
  }

  /** "Stop SIP" saves the date in the plan's latest row (column J); `null` clears it again (Resume). */
  async stopInvestment(ref: RowRef & { tab: "investments" }, stoppedOn: Date | null): Promise<WriteResult> {
    try {
      const at = (await this.locate([ref]))?.[0];
      if (!at) return GONE;
      const n = at.index + 1;
      const cell = stoppedOn ? toSheetDateTime(stoppedOn, (await this.loadMeta()).properties.timeZone) : "";
      await this.api.call("PUT", `${this.base}/values/${encodeURIComponent(range(TABS.investments, `J${n}:J${n}`))}?valueInputOption=USER_ENTERED`, {
        values: [[cell]],
      });
      return { ok: true };
    } catch (err) {
      return failure(err);
    }
  }

  /** Rewrites columns A–D (date, amount, category, note) of one expense; payment method, card and place stay. */
  async update(ref: RowRef & { tab: "expenses" }, next: ValidExpense): Promise<WriteResult> {
    try {
      const at = (await this.locate([ref]))?.[0];
      if (!at) return GONE;
      const n = at.index + 1;
      const values = [[toSheetDateTime(next.date, (await this.loadMeta()).properties.timeZone), next.amount, text(next.category), text(next.remark)]];
      await this.api.call("PUT", `${this.base}/values/${encodeURIComponent(range(TABS.expenses, `A${n}:D${n}`))}?valueInputOption=USER_ENTERED`, { values });
      return { ok: true };
    } catch (err) {
      return failure(err);
    }
  }

  async load(): Promise<LoadResult> {
    try {
      const meta = await this.loadMeta();
      const tz = meta.properties.timeZone;
      const present = new Set(meta.sheets?.map((s) => s.properties.title));
      const tabs = Object.values(TABS).filter((t) => present.has(t.title));

      const rowsByTab = new Map<string, Cell[][]>();
      if (tabs.length) {
        const params = new URLSearchParams({ valueRenderOption: "UNFORMATTED_VALUE", dateTimeRenderOption: "SERIAL_NUMBER" });
        for (const t of tabs) params.append("ranges", range(t));
        const res = await this.api.call<{ valueRanges?: { values?: Cell[][] }[] }>("GET", `${this.base}/values:batchGet?${params}`);
        tabs.forEach((t, i) => rowsByTab.set(t.title, res.valueRanges?.[i]?.values ?? []));
      }
      const rows = (t: Tab) => rowsByTab.get(t.title) ?? [];

      // Sheets made by an older hisabo lack the newer columns' headers: add them once (the data needs no change).
      for (const t of tabs) {
        const header = rows(t)[0] ?? [];
        if (t !== TABS.profile && clean(header[0]) === t.headers[0] && header.length < t.headers.length) await this.writeHeader(t);
      }

      const data: SheetData = {
        expenses: readExpenses(rows(TABS.expenses), tz),
        subscriptions: readSubscriptions(rows(TABS.subscriptions), tz),
        emis: readEmis(rows(TABS.emis), tz),
        emiPayments: readEmiPayments(rows(TABS.emiPayments), tz),
        investments: readInvestments(rows(TABS.investments), tz),
        profile: readProfile(rows(TABS.profile)),
      };
      return { ok: true, demo: false, version: dataVersion(data), generatedAt: new Date().toISOString(), ...data };
    } catch (err) {
      return failure(err);
    }
  }

  async append(entry: NewEntry): Promise<WriteResult> {
    const tab = TAB_FOR[entry.kind];
    try {
      const tz = (await this.loadMeta()).properties.timeZone;
      // A payment belongs to an EMI that exists, so a typo can't start a second, phantom EMI.
      if (entry.kind === "emiPayment") {
        const name = await this.findEmi(entry.emiName);
        if (!name) return { ok: false, error: `No EMI called "${entry.emiName}". Add it with New EMI first.` };
        entry = { ...entry, emiName: name };
      }
      const values = [rowFor(entry, tz, new Date())];
      const url = `${this.base}/values/${encodeURIComponent(range(tab))}:append?valueInputOption=USER_ENTERED&insertDataOption=INSERT_ROWS`;
      let res: { updates?: { updatedRange?: string } };
      try {
        res = await this.api.call("POST", url, { values });
      } catch (err) {
        // The tab was deleted or renamed: recreate it with headers, then try once more.
        if (!isMissingTab(err)) throw err;
        await this.addTab(tab);
        res = await this.api.call("POST", url, { values });
      }
      // The tab existed but was empty, so the row landed on row 1: put the header row back above it.
      if (/![A-Z]+1:/.test(res.updates?.updatedRange ?? "")) await this.insertHeader(tab);
      return { ok: true };
    } catch (err) {
      return failure(err);
    }
  }

  async saveProfile(p: Profile): Promise<WriteResult> {
    const tab = TABS.profile;
    const rows: Cell[][] = [
      [...tab.headers],
      ["Name", text(p.name)],
      ["Email", text(p.email)],
      ["Monthly income", p.monthlyIncome ?? ""],
      ["Monthly budget", p.monthlyBudget ?? ""],
      ["Payday (day of month)", p.payday ?? ""],
    ];
    try {
      const clearUrl = `${this.base}/values/${encodeURIComponent(`'${tab.title}'`)}:clear`;
      try {
        await this.api.call("POST", clearUrl, {});
      } catch (err) {
        if (!isMissingTab(err)) throw err;
        await this.addTab(tab);
      }
      await this.api.call("PUT", `${this.base}/values/${encodeURIComponent(range(tab, `A1:B${rows.length}`))}?valueInputOption=USER_ENTERED`, {
        values: rows,
      });
      return { ok: true };
    } catch (err) {
      return failure(err);
    }
  }

  /** The EMI's name as written in the EMI tab (any capitals match), or null when there's none. */
  private async findEmi(name: string): Promise<string | null> {
    const wanted = name.trim().toLowerCase();
    try {
      const res = await this.api.call<{ values?: Cell[][] }>("GET", `${this.base}/values/${encodeURIComponent(range(TABS.emis, "B:B"))}`);
      const hit = (res.values ?? []).slice(1).find((r) => clean(r[0]).toLowerCase() === wanted);
      return hit ? clean(hit[0]) : null;
    } catch (err) {
      if (isMissingTab(err)) return null;
      throw err;
    }
  }

  private async writeHeader(tab: Tab) {
    const cells = `A1:${String.fromCharCode(64 + tab.headers.length)}1`;
    await this.api.call("PUT", `${this.base}/values/${encodeURIComponent(range(tab, cells))}?valueInputOption=RAW`, { values: [[...tab.headers]] });
  }

  private async loadMeta(): Promise<Meta> {
    this.meta ??= await this.api.call<Meta>("GET", `${this.base}?fields=properties.timeZone,sheets.properties(sheetId,title)`);
    return this.meta;
  }

  private async addTab(tab: Tab) {
    const sheetId = Math.floor(Math.random() * 2_000_000_000) + 1;
    try {
      await this.api.call("POST", `${this.base}:batchUpdate`, {
        requests: [
          { addSheet: { properties: { sheetId, title: tab.title, gridProperties: { frozenRowCount: 1 } } } },
          { updateCells: { start: { sheetId, rowIndex: 0, columnIndex: 0 }, rows: [headerRow(tab.headers)], fields: "userEnteredValue,userEnteredFormat.textFormat.bold" } },
        ],
      });
    } catch (err) {
      // Another request recreated it first.
      if (!isDuplicateTab(err)) throw err;
    }
    this.meta = null;
  }

  private async insertHeader(tab: Tab) {
    this.meta = null;
    const sheetId = (await this.loadMeta()).sheets?.find((s) => s.properties.title === tab.title)?.properties.sheetId;
    if (sheetId === undefined) return;
    await this.api.call("POST", `${this.base}:batchUpdate`, {
      requests: [
        { insertDimension: { range: { sheetId, dimension: "ROWS", startIndex: 0, endIndex: 1 }, inheritFromBefore: false } },
        { updateCells: { start: { sheetId, rowIndex: 0, columnIndex: 0 }, rows: [headerRow(tab.headers)], fields: "userEnteredValue,userEnteredFormat.textFormat.bold" } },
      ],
    });
  }
}

/** Whether hisabo can still open this spreadsheet (it may have been deleted, or the user switched Google accounts). */
export async function checkSpreadsheet(opts: {
  spreadsheetId: string;
  accessToken: AccessTokenSource;
  fetch?: typeof fetch;
}): Promise<{ ok: true } | StoreFailure> {
  const api = new SheetsApi(opts.accessToken, opts.fetch ?? fetch);
  try {
    await api.call("GET", `${SHEETS_API}/${encodeURIComponent(opts.spreadsheetId)}?fields=spreadsheetId`);
    return { ok: true };
  } catch (err) {
    return failure(err);
  }
}

/**
 * Creates the user's "hisabo" spreadsheet with all four tabs and their headers. With `drive.file`,
 * this file is the only one in their Drive that hisabo can open.
 */
export async function createSpreadsheet(opts: {
  accessToken: AccessTokenSource;
  /** the user's browser time zone, so dates land on the right day */
  timeZone: string;
  title?: string;
  fetch?: typeof fetch;
}): Promise<{ ok: true; spreadsheetId: string } | StoreFailure> {
  const api = new SheetsApi(opts.accessToken, opts.fetch ?? fetch);
  const timeZone = isValidTimeZone(opts.timeZone) ? opts.timeZone : "UTC";
  try {
    const res = await api.call<{ spreadsheetId: string }>("POST", SHEETS_API, {
      properties: { title: opts.title ?? "hisabo", timeZone },
      sheets: Object.values(TABS).map((tab: Tab) => ({
        properties: { title: tab.title, gridProperties: { frozenRowCount: 1 } },
        data: [{ startRow: 0, startColumn: 0, rowData: [headerRow(tab.headers)] }],
      })),
    });
    return { ok: true, spreadsheetId: res.spreadsheetId };
  } catch (err) {
    return failure(err);
  }
}
