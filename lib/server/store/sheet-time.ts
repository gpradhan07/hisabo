/**
 * Google Sheets keeps dates as "serial numbers": days since 30 Dec 1899, counted in the
 * spreadsheet's own time zone. These helpers convert between that and real instants.
 */

const DAY_MS = 86_400_000;
const SERIAL_EPOCH = Date.UTC(1899, 11, 30);

const formatters = new Map<string, Intl.DateTimeFormat>();

function formatter(timeZone: string) {
  let f = formatters.get(timeZone);
  if (!f) {
    f = new Intl.DateTimeFormat("en-US", {
      timeZone,
      hourCycle: "h23",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });
    formatters.set(timeZone, f);
  }
  return f;
}

/** The wall-clock time in `timeZone` at instant `t`, expressed as if it were UTC milliseconds. */
function wallClock(t: number, timeZone: string): number {
  const parts: Record<string, number> = {};
  for (const p of formatter(timeZone).formatToParts(new Date(t))) parts[p.type] = Number(p.value);
  return Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute, parts.second) + (((t % 1000) + 1000) % 1000);
}

/** The instant at which the clock in `timeZone` shows `wall`. Two passes settle daylight-saving changes. */
function instantOf(wall: number, timeZone: string): number {
  const first = wall - (wallClock(wall, timeZone) - wall);
  return wall - (wallClock(first, timeZone) - first);
}

export function isValidTimeZone(timeZone: string): boolean {
  try {
    formatter(timeZone);
    return true;
  } catch {
    return false;
  }
}

/** A date cell read with `dateTimeRenderOption=SERIAL_NUMBER` → ISO string. */
export function serialToIso(serial: number, timeZone: string): string | null {
  if (!Number.isFinite(serial)) return null;
  const d = new Date(instantOf(SERIAL_EPOCH + Math.round(serial * DAY_MS), timeZone));
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

/** An instant → "2026-10-21 14:30:00" in the sheet's time zone, which Sheets stores as a real date with `USER_ENTERED`. */
export function toSheetDateTime(date: Date, timeZone: string): string {
  return new Date(wallClock(date.getTime(), timeZone)).toISOString().slice(0, 19).replace("T", " ");
}
