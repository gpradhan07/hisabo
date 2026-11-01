import { describe, expect, it } from "vitest";
import { isValidTimeZone, serialToIso, toSheetDateTime } from "./sheet-time";

describe("sheet dates", () => {
  it("reads a serial number in the sheet's time zone", () => {
    expect(serialToIso(45658, "UTC")).toBe("2025-01-01T00:00:00.000Z");
    // Midnight in India is 18:30 the previous day in UTC.
    expect(serialToIso(45658, "Asia/Kolkata")).toBe("2024-12-31T18:30:00.000Z");
    expect(serialToIso(45658.5, "Asia/Kolkata")).toBe("2025-01-01T06:30:00.000Z");
  });

  it("writes the wall-clock time of the sheet's time zone", () => {
    const at = new Date("2026-10-21T09:00:00Z");
    expect(toSheetDateTime(at, "Asia/Kolkata")).toBe("2026-10-21 14:30:00");
    expect(toSheetDateTime(at, "UTC")).toBe("2026-10-21 09:00:00");
    expect(toSheetDateTime(at, "America/Los_Angeles")).toBe("2026-10-21 02:00:00");
  });

  it("handles daylight-saving time on both sides of the change", () => {
    // New York moves from UTC-4 to UTC-5 on 1 Nov 2026.
    const before = Date.UTC(2026, 9, 31, 12) / 86_400_000 + 25569; // 31 Oct 12:00 wall time
    const after = Date.UTC(2026, 10, 2, 12) / 86_400_000 + 25569; // 2 Nov 12:00 wall time
    expect(serialToIso(before, "America/New_York")).toBe("2026-10-31T16:00:00.000Z");
    expect(serialToIso(after, "America/New_York")).toBe("2026-11-02T17:00:00.000Z");
  });

  it("handles the hours right after clocks go forward", () => {
    // New York jumps from 02:00 EST to 03:00 EDT on 8 Mar 2026 (07:00 UTC).
    const wall = (h: number, m = 0) => Date.UTC(2026, 2, 8, h, m) / 86_400_000 + 25569;
    expect(serialToIso(wall(3, 30), "America/New_York")).toBe("2026-03-08T07:30:00.000Z");
    expect(serialToIso(wall(6), "America/New_York")).toBe("2026-03-08T10:00:00.000Z");
    expect(serialToIso(wall(1, 30), "America/New_York")).toBe("2026-03-08T06:30:00.000Z");
  });

  it("round-trips an instant through the sheet", () => {
    for (const tz of ["Asia/Kolkata", "America/New_York", "Europe/London", "Australia/Adelaide", "UTC"]) {
      const at = new Date("2026-03-29T01:30:00Z");
      const [d, t] = toSheetDateTime(at, tz).split(" ");
      const [y, mo, da] = d.split("-").map(Number);
      const [h, mi, s] = t.split(":").map(Number);
      const serial = (Date.UTC(y, mo - 1, da, h, mi, s) - Date.UTC(1899, 11, 30)) / 86_400_000;
      expect(serialToIso(serial, tz)).toBe(at.toISOString());
    }
  });

  it("checks time zone names", () => {
    expect(isValidTimeZone("Asia/Kolkata")).toBe(true);
    expect(isValidTimeZone("Asia/Calcutta")).toBe(true);
    expect(isValidTimeZone("Mars/Olympus")).toBe(false);
  });
});
