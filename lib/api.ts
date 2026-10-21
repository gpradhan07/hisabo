import type { ApiResponse, Dataset, Emi, Expense, Investment } from "./types";

export function toDataset(json: ApiResponse): Dataset {
  const expenses: Expense[] = [];
  for (const r of json.expenses ?? []) {
    const date = parseDate(r.date);
    const amount = toNumber(r.amount);
    if (!date || !Number.isFinite(amount) || amount === 0) continue;
    expenses.push({
      id: `e${r.row}`,
      date,
      amount,
      category: tidyCategory(r.category),
      remark: r.remark ?? "",
    });
  }
  expenses.sort((a, b) => b.date.getTime() - a.date.getTime());

  const emis: Emi[] = [];
  for (const r of json.emis ?? []) {
    const monthly = toNumber(r.monthly);
    const tenure = Math.round(toNumber(r.tenure));
    if (!r.name || !Number.isFinite(monthly) || !Number.isFinite(tenure) || tenure <= 0) continue;
    const total = toNumber(r.total);
    emis.push({
      id: `m${r.row}`,
      name: r.name,
      monthly,
      tenure,
      total: Number.isFinite(total) && total > 0 ? total : monthly * tenure,
      startDate: parseDate(r.startDate, true),
      addedOn: parseDate(r.addedOn),
    });
  }

  const investments: Investment[] = [];
  for (const r of json.investments ?? []) {
    const date = parseDate(r.date);
    const amount = toNumber(r.amount);
    if (!date || !Number.isFinite(amount) || amount <= 0) continue;
    investments.push({
      id: `i${r.row}`,
      date,
      amount,
      type: tidyCategory(r.investmentType),
      frequency: tidyFrequency(r.frequency),
      paymentMethod: (r.paymentMethod ?? "").trim(),
      remark: (r.remark ?? "").trim(),
    });
  }
  investments.sort((a, b) => b.date.getTime() - a.date.getTime());

  return {
    expenses,
    emis,
    investments,
    syncedAt: json.generatedAt ? new Date(json.generatedAt) : new Date(),
  };
}

/** "monthly", "SIP", "one time", "annual"… → One-time / Monthly / Quarterly / Half-yearly / Yearly */
export function tidyFrequency(f: string | undefined): string {
  const s = (f ?? "").trim().toLowerCase().replace(/[\s_-]+/g, "");
  if (!s || s === "onetime" || s === "once" || s === "lumpsum") return "One-time";
  if (s === "monthly" || s === "sip" || s === "month") return "Monthly";
  if (s === "quarterly" || s === "quarter") return "Quarterly";
  if (s === "halfyearly" || s === "semiannual" || s === "semiannually" || s === "sixmonthly") return "Half-yearly";
  if (s === "yearly" || s === "annual" || s === "annually" || s === "year") return "Yearly";
  const raw = (f ?? "").trim();
  return raw.charAt(0).toUpperCase() + raw.slice(1);
}

function toNumber(v: number | string | null | undefined): number {
  if (typeof v === "number") return v;
  if (typeof v !== "string") return NaN;
  const cleaned = v.replace(/[^0-9.\-]/g, "");
  return cleaned ? Number(cleaned) : NaN;
}

function tidyCategory(c: string | undefined): string {
  const s = (c ?? "").trim();
  if (!s) return "Uncategorised";
  return s.charAt(0).toUpperCase() + s.slice(1);
}

const MONTHS = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];

/**
 * Dates from the sheet are ISO strings. The EMI start date may also be raw text typed
 * into the Shortcut, so accept common formats too (day-first, like 05/03/2026 or 5 Mar 2026).
 */
export function parseDate(v: string | null | undefined, dateOnly = false): Date | null {
  if (!v) return null;
  const s = v.trim();

  // ISO from Apps Script
  if (/^\d{4}-\d{2}-\d{2}T/.test(s)) {
    const d = new Date(s);
    if (isNaN(d.getTime())) return null;
    return dateOnly ? new Date(d.getFullYear(), d.getMonth(), d.getDate()) : d;
  }
  // 2026-03-05
  let m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (m) return new Date(+m[1], +m[2] - 1, +m[3]);
  // 05/03/2026, 05-03-2026, 05.03.26 (day first)
  m = s.match(/^(\d{1,2})[/.\-](\d{1,2})[/.\-](\d{2,4})$/);
  if (m) {
    const y = +m[3] < 100 ? 2000 + +m[3] : +m[3];
    return new Date(y, +m[2] - 1, +m[1]);
  }
  // 5 Mar 2026 / 5 March, 2026
  m = s.match(/^(\d{1,2})\s+([A-Za-z]{3,})\.?,?\s+(\d{4})/);
  if (m) {
    const mi = MONTHS.indexOf(m[2].slice(0, 3).toLowerCase());
    if (mi >= 0) return new Date(+m[3], mi, +m[1]);
  }
  // Mar 5, 2026 and anything else the browser understands
  const d = new Date(s.replace(/\sat\s/i, " "));
  if (isNaN(d.getTime())) return null;
  return dateOnly ? new Date(d.getFullYear(), d.getMonth(), d.getDate()) : d;
}
