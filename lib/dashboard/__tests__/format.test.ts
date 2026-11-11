import { describe, expect, it } from "vitest";
import { formatLabel } from "../format";

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
