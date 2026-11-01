/* eslint-disable @typescript-eslint/no-explicit-any -- loosely typed request bodies in a test fake */
/**
 * An in-memory stand-in for the parts of the Google Sheets API that hisabo calls. It follows the real
 * API's rules that matter here: USER_ENTERED parsing (dates, numbers, leading apostrophe = text),
 * serial-number dates, trailing blanks trimmed on read, and the same error codes and messages.
 */

type Cell = string | number | boolean;

interface FakeTab {
  sheetId: number;
  title: string;
  rows: Cell[][];
}

export interface FakeFile {
  id: string;
  title: string;
  timeZone: string;
  tabs: FakeTab[];
}

const DAY_MS = 86_400_000;
const SERIAL_EPOCH = Date.UTC(1899, 11, 30);
const ROOT = "/v4/spreadsheets";

class HttpError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

const col = (letters: string) => [...letters].reduce((n, c) => n * 26 + c.charCodeAt(0) - 64, 0) - 1;
const letter = (index: number) => String.fromCharCode(65 + index);

function parseRange(a1: string) {
  const m = a1.match(/^(?:'((?:[^']|'')+)'|([^!]+))(?:!([A-Z]+)(\d+)?(?::([A-Z]+)(\d+)?)?)?$/);
  if (!m) throw new HttpError(400, `Unable to parse range: ${a1}`);
  const title = (m[1] ?? m[2]).replace(/''/g, "'");
  return { title, startCol: m[3] ? col(m[3]) : 0, startRow: m[4] ? +m[4] - 1 : 0, endCol: m[5] ? col(m[5]) : undefined };
}

const serialOf = (y: number, m: number, d: number, h = 0, mi = 0, s = 0) => (Date.UTC(y, m - 1, d, h, mi, s) - SERIAL_EPOCH) / DAY_MS;

/** What Sheets stores when a value arrives with valueInputOption=USER_ENTERED (en-US locale). */
export function userEntered(v: Cell): Cell {
  if (typeof v !== "string") return v;
  if (v.startsWith("'")) return v.slice(1);
  // A formula: reading back gives its result, never the text that was sent.
  if (v.startsWith("=")) return "#FORMULA-RESULT";
  let d = v.match(/^(\d{4})-(\d{2})-(\d{2})(?: (\d{2}):(\d{2}):(\d{2}))?$/);
  if (d) return serialOf(+d[1], +d[2], +d[3], +(d[4] ?? 0), +(d[5] ?? 0), +(d[6] ?? 0));
  // Month first, year optional ("1/2" → 2 January this year).
  d = v.match(/^(\d{1,2})\/(\d{1,2})(?:\/(\d{4}))?$/);
  if (d) return serialOf(d[3] ? +d[3] : new Date().getUTCFullYear(), +d[1], +d[2]);
  if (/^[+-]?\d+(\.\d+)?%$/.test(v)) return Number(v.slice(0, -1)) / 100;
  if (/^[+-]?\d+(\.\d+)?$/.test(v)) return Number(v);
  if (/^(true|false)$/i.test(v)) return v.toLowerCase() === "true";
  return v;
}

function trimRows(rows: Cell[][]): Cell[][] {
  const out = rows.map((r) => {
    let end = r.length;
    while (end > 0 && (r[end - 1] === "" || r[end - 1] === undefined)) end--;
    return Array.from({ length: end }, (_, i) => r[i] ?? "");
  });
  while (out.length && out[out.length - 1].length === 0) out.pop();
  return out;
}

export class FakeSheets {
  /** The access token Google currently accepts. Change it to simulate expiry. */
  validToken = "token-1";
  readonly calls: string[] = [];
  private readonly files = new Map<string, FakeFile>();
  private nextId = 1;

  file(id: string): FakeFile {
    const f = this.files.get(id);
    if (!f) throw new Error(`no file ${id}`);
    return f;
  }

  tab(id: string, title: string): FakeTab | undefined {
    return this.file(id).tabs.find((t) => t.title === title);
  }

  /** Rows of a tab as Sheets would return them (trailing blanks trimmed). */
  rows(id: string, title: string): Cell[][] {
    return trimRows(this.tab(id, title)?.rows ?? []);
  }

  /** A spreadsheet created outside hisabo's code path, for tests that start from a given state. */
  seed(file: Omit<FakeFile, "id" | "tabs"> & { tabs: Record<string, Cell[][]> }): string {
    const id = `sheet-${this.nextId++}`;
    this.files.set(id, {
      id,
      title: file.title,
      timeZone: file.timeZone,
      tabs: Object.entries(file.tabs).map(([title, rows], i) => ({ sheetId: i + 1, title, rows })),
    });
    return id;
  }

  readonly fetch: typeof fetch = async (input, init) => {
    const url = new URL(String(input));
    const method = init?.method ?? "GET";
    this.calls.push(`${method} ${decodeURIComponent(url.pathname)}`);
    try {
      if (init?.headers && (init.headers as Record<string, string>).Authorization !== `Bearer ${this.validToken}`) {
        throw new HttpError(401, "Request had invalid authentication credentials.");
      }
      const body = init?.body ? JSON.parse(String(init.body)) : undefined;
      return Response.json(this.route(method, url, body));
    } catch (err) {
      if (!(err instanceof HttpError)) throw err;
      return Response.json({ error: { code: err.status, message: err.message } }, { status: err.status });
    }
  };

  private route(method: string, url: URL, body: any): unknown {
    const path = url.pathname;
    if (method === "POST" && path === ROOT) return this.create(body);

    const m = path.match(/^\/v4\/spreadsheets\/([^/:]+)(.*)$/);
    if (!m) throw new HttpError(404, "Not found");
    const file = this.files.get(decodeURIComponent(m[1]));
    if (!file) throw new HttpError(404, "Requested entity was not found.");
    const rest = m[2];

    if (method === "GET" && rest === "") {
      return {
        properties: { title: file.title, timeZone: file.timeZone },
        sheets: file.tabs.map((t) => ({ properties: { sheetId: t.sheetId, title: t.title } })),
      };
    }
    if (method === "POST" && rest === ":batchUpdate") return this.batchUpdate(file, body.requests);
    if (method === "GET" && rest === "/values:batchGet") {
      return {
        valueRanges: url.searchParams.getAll("ranges").map((r) => {
          const { title, startCol, endCol } = parseRange(r);
          const tab = this.tabOrError(file, r, title);
          const values = trimRows(tab.rows.map((row) => row.slice(startCol, endCol === undefined ? undefined : endCol + 1)));
          return { range: r, values };
        }),
      };
    }

    const v = rest.match(/^\/values\/([^:]+)(?::(append|clear))?$/);
    if (!v) throw new HttpError(404, "Not found");
    const a1 = decodeURIComponent(v[1]);
    const { title, startRow, startCol } = parseRange(a1);
    const tab = this.tabOrError(file, a1, title);

    if (method === "GET" && !v[2]) {
      const { endCol } = parseRange(a1);
      return { range: a1, values: trimRows(tab.rows.map((row) => row.slice(startCol, endCol === undefined ? undefined : endCol + 1))) };
    }
    if (method === "POST" && v[2] === "append") {
      const at = trimRows(tab.rows).length;
      body.values.forEach((row: Cell[], i: number) => (tab.rows[at + i] = row.map(userEntered)));
      const last = at + body.values.length;
      const width = Math.max(...body.values.map((r: Cell[]) => r.length));
      return { updates: { updatedRange: `'${title}'!A${at + 1}:${letter(width - 1)}${last}`, updatedRows: body.values.length } };
    }
    if (method === "POST" && v[2] === "clear") {
      tab.rows = [];
      return { clearedRange: a1 };
    }
    if (method === "PUT" && !v[2]) {
      body.values.forEach((row: Cell[], i: number) => {
        const target = (tab.rows[startRow + i] ??= []);
        row.forEach((cell, j) => (target[startCol + j] = userEntered(cell)));
      });
      return { updatedRange: a1 };
    }
    throw new HttpError(404, "Not found");
  }

  private tabOrError(file: FakeFile, a1: string, title: string): FakeTab {
    const tab = file.tabs.find((t) => t.title === title);
    if (!tab) throw new HttpError(400, `Unable to parse range: ${a1}`);
    return tab;
  }

  private create(body: any) {
    const id = `sheet-${this.nextId++}`;
    this.files.set(id, {
      id,
      title: body.properties.title,
      timeZone: body.properties.timeZone,
      tabs: body.sheets.map((s: any, i: number) => ({
        sheetId: i + 1,
        title: s.properties.title,
        rows: (s.data?.[0]?.rowData ?? []).map((r: any) => r.values.map((c: any) => c.userEnteredValue.stringValue)),
      })),
    });
    return { spreadsheetId: id };
  }

  private batchUpdate(file: FakeFile, requests: any[]) {
    for (const r of requests) {
      if (r.addSheet) {
        const { title, sheetId } = r.addSheet.properties;
        if (file.tabs.some((t) => t.title === title)) {
          throw new HttpError(400, `Invalid requests[0].addSheet: A sheet with the name "${title}" already exists. Please enter another name.`);
        }
        file.tabs.push({ sheetId: sheetId ?? file.tabs.length + 1, title, rows: [] });
      } else if (r.updateCells) {
        const { start, rows } = r.updateCells;
        const tab = file.tabs.find((t) => t.sheetId === start.sheetId)!;
        rows.forEach((row: any, i: number) => {
          const target = (tab.rows[start.rowIndex + i] ??= []);
          row.values.forEach((c: any, j: number) => (target[start.columnIndex + j] = c.userEnteredValue.stringValue));
        });
      } else if (r.insertDimension) {
        const { sheetId, startIndex, endIndex } = r.insertDimension.range;
        const tab = file.tabs.find((t) => t.sheetId === sheetId)!;
        tab.rows.splice(startIndex, 0, ...Array.from({ length: endIndex - startIndex }, () => []));
      } else if (r.deleteDimension) {
        const { sheetId, dimension, startIndex, endIndex } = r.deleteDimension.range;
        const tab = file.tabs.find((t) => t.sheetId === sheetId);
        if (!tab || dimension !== "ROWS") throw new HttpError(400, "Invalid requests[0].deleteDimension");
        tab.rows.splice(startIndex, endIndex - startIndex);
      } else {
        throw new HttpError(400, `Unsupported request ${Object.keys(r)[0]}`);
      }
    }
    return { replies: requests.map(() => ({})) };
  }
}
