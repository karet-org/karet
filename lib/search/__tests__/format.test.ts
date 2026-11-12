import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { formatEventDate, formatEventTime } from "../format";

// 2026-11-12, as DuckDB sends a DATE: midnight UTC in epoch seconds.
const NOV_12 = Date.UTC(2026, 10, 12) / 1000;

describe("formatEventDate", () => {
  const tz = process.env.TZ;
  beforeAll(() => {
    process.env.TZ = "America/Denver";
  });
  afterAll(() => {
    process.env.TZ = tz;
  });

  it("shows a DATE on its own day west of UTC", () => {
    expect(formatEventDate(NOV_12)).toBe("Nov 12");
  });

  it("differs from the local time, which falls on the day before", () => {
    expect(formatEventTime(NOV_12)).toBe("Nov 11 17:00:00.000");
  });
});
