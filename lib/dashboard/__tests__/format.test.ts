import { describe, expect, it } from "vitest";
import { formatLabel, labelTimes } from "../format";

describe("formatLabel", () => {
  it("shows a midnight timestamp as a date", () => {
    expect(formatLabel("2026-09-10T00:00:00.000Z")).toBe("2026-09-10");
    expect(formatLabel("2026-09-10T00:00:00Z")).toBe("2026-09-10");
  });

  it("keeps the hour and minute of any other time", () => {
    expect(formatLabel("2026-09-10T14:05:30.000Z")).toBe("2026-09-10 14:05");
    expect(formatLabel("2026-09-10T00:00:01.000Z")).toBe("2026-09-10 00:00");
  });

  it("leaves anything else alone", () => {
    for (const v of ["2026-09", "visa-1234", "", "2026-09-10", "2026-09-10T00:00:00+02:00"]) {
      expect(formatLabel(v)).toBe(v);
    }
  });
});

describe("labelTimes", () => {
  it("places dates by time, so a seven-week gap is wider than a one-day gap", () => {
    const t = labelTimes(["2026-09-10T00:00:00.000Z", "2026-09-11T00:00:00.000Z", "2026-10-29"])!;
    expect(t[1] - t[0]).toBe(86_400_000);
    expect(t[2] - t[1]).toBe(48 * 86_400_000);
  });

  it("returns null when any label is not a date, so the chart keeps a category axis", () => {
    expect(labelTimes(["2026-09-10", "visa"])).toBeNull();
    expect(labelTimes(["2026-09", "2026-10"])).toBeNull();
    expect(labelTimes([])).toBeNull();
  });
});
