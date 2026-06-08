import { describe, expect, it } from "vitest";
import { previousPeriodLabel, runningTotal } from "../aggregate";

describe("previousPeriodLabel", () => {
  it("steps back one month, rolling over the year", () => {
    expect(previousPeriodLabel("2024-06", "month")).toBe("2024-05");
    expect(previousPeriodLabel("2024-01", "month")).toBe("2023-12");
  });

  it("steps back one year", () => {
    expect(previousPeriodLabel("2024", "year")).toBe("2023");
  });

  it("steps back one day across a month boundary", () => {
    expect(previousPeriodLabel("2024-06-01", "day")).toBe("2024-05-31");
  });

  it("steps back one ISO week, rolling over the year", () => {
    expect(previousPeriodLabel("2024-W06", "week")).toBe("2024-W05");
    expect(previousPeriodLabel("2024-W01", "week")).toBe("2023-W52");
  });

  it("falls back to 'Start' for no bin or unparseable labels", () => {
    expect(previousPeriodLabel("2024-06", undefined)).toBe("Start");
    expect(previousPeriodLabel("nonsense", "month")).toBe("Start");
  });
});

describe("runningTotal", () => {
  it("returns an empty array for empty input", () => {
    expect(runningTotal([])).toEqual([]);
  });

  it("accumulates left to right", () => {
    expect(runningTotal([1, 2, 3, 4])).toEqual([1, 3, 6, 10]);
  });

  it("handles negative values (deficit months pull the curve down)", () => {
    expect(runningTotal([100, -40, -30, 50])).toEqual([100, 60, 30, 80]);
  });

  it("preserves the original values when there is a single bucket", () => {
    expect(runningTotal([42])).toEqual([42]);
  });

  it("does not mutate its input", () => {
    const input = [5, 10, 15];
    runningTotal(input);
    expect(input).toEqual([5, 10, 15]);
  });
});
