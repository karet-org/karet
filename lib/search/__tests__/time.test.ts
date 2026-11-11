import { describe, expect, it } from "vitest";
import { detectTimeField, intervalLabel, pickInterval, timeExpression } from "../time";

describe("detectTimeField", () => {
  it("prefers a TIMESTAMP column", () => {
    expect(detectTimeField([{ name: "ts", type: "DOUBLE" }, { name: "at", type: "TIMESTAMP WITH TIME ZONE" }])).toBe("at");
  });

  it("takes a numeric or text column with a usual time name", () => {
    expect(detectTimeField([{ name: "host", type: "VARCHAR" }, { name: "ts", type: "DOUBLE" }])).toBe("ts");
    expect(detectTimeField([{ name: "Timestamp", type: "VARCHAR" }])).toBe("Timestamp");
  });

  it("skips a time-named column of another type", () => {
    expect(detectTimeField([{ name: "time", type: "BOOLEAN" }])).toBeNull();
  });

  it("falls back to a DATE column", () => {
    expect(detectTimeField([{ name: "day", type: "DATE" }, { name: "n", type: "BIGINT" }])).toBe("day");
  });
});

describe("timeExpression", () => {
  it("reads each kind of column as epoch seconds", () => {
    expect(timeExpression({ name: "at", type: "TIMESTAMP" })).toBe('epoch("at")');
    expect(timeExpression({ name: "d", type: "DATE" })).toBe('epoch(CAST("d" AS TIMESTAMP))');
    expect(timeExpression({ name: "ts", type: "DOUBLE" })).toBe(
      '(CASE WHEN abs(CAST("ts" AS DOUBLE)) > 1e11 THEN CAST("ts" AS DOUBLE) / 1000.0 ELSE CAST("ts" AS DOUBLE) END)',
    );
    expect(timeExpression({ name: "ts", type: "VARCHAR" })).toContain('epoch(TRY_CAST("ts" AS TIMESTAMP))');
  });
});

describe("pickInterval", () => {
  it("keeps the bar count at 60 or fewer", () => {
    expect(pickInterval(3600)).toBe(60);
    expect(pickInterval(24 * 3600)).toBe(30 * 60);
    expect(pickInterval(7 * 86400)).toBe(3 * 3600);
    expect(pickInterval(15 * 60)).toBe(30);
    expect(pickInterval(10)).toBe(1);
  });
});

describe("intervalLabel", () => {
  it("names the interval", () => {
    expect(intervalLabel(1)).toBe("second");
    expect(intervalLabel(30)).toBe("30 seconds");
    expect(intervalLabel(1800)).toBe("30 minutes");
    expect(intervalLabel(3 * 3600)).toBe("3 hours");
    expect(intervalLabel(7 * 86400)).toBe("week");
  });
});
