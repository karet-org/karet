import { describe, expect, it } from "vitest";
import {
  fillFor,
  legendTicks,
  NO_DATA_FILL,
  rampColor,
  ranks,
  scalePosition,
  skippedSummary,
  tooltipText,
  valueRange,
} from "../choropleth";

describe("choropleth scale", () => {
  it("spreads values over orders of magnitude instead of crowding them at the bottom", () => {
    // Requests per country: a median country with 318 against a top one with
    // 836,747 must land well away from the lowest colour.
    expect(scalePosition(318, 1, 836_747)).toBeGreaterThan(0.4);
    expect(scalePosition(836_747, 1, 836_747)).toBe(1);
    expect(scalePosition(1, 1, 836_747)).toBe(0);
  });

  it("uses the whole ramp for the range the values cover", () => {
    expect(scalePosition(200, 200, 60_000)).toBe(0);
    expect(scalePosition(60_000, 200, 60_000)).toBe(1);
    expect(scalePosition(5, 5, 5)).toBe(1);
  });

  it("finds the positive range of the values", () => {
    expect(valueRange([0, 40, 7, 900])).toEqual({ min: 7, max: 900 });
    expect(valueRange([0, -3])).toBeNull();
  });

  it("gets brighter as the value grows", () => {
    const brightness = (c: string) =>
      c.match(/\d+/g)!.map(Number).reduce((a, b) => a + b, 0);
    expect(brightness(rampColor(1))).toBeGreaterThan(brightness(rampColor(0.5)));
    expect(brightness(rampColor(0.5))).toBeGreaterThan(brightness(rampColor(0)));
  });

  it("tells a country with no row apart from one with a value of zero", () => {
    expect(fillFor(undefined, 1, 10)).toBe(NO_DATA_FILL);
    expect(fillFor(0, 1, 10)).not.toBe(NO_DATA_FILL);
  });
});

describe("legend ticks", () => {
  it("labels the minimum, the powers of ten between, and the maximum, in order", () => {
    const ticks = legendTicks(1, 836_747);
    expect(ticks.map((t) => t.label)).toEqual(["1", "10", "100", "1K", "10K", "100K", "836.7K"]);
    const positions = ticks.map((t) => t.position);
    expect(positions).toEqual([...positions].sort((a, b) => a - b));
    expect(positions.at(-1)).toBe(1);
  });

  it("drops a power of ten that would overlap an end label", () => {
    expect(legendTicks(80, 12_000).map((t) => t.label)).toEqual(["80", "1K", "12K"]);
  });

  it("shows one label when every country has the same value", () => {
    expect(legendTicks(5, 5)).toEqual([{ label: "5", position: 1 }]);
  });

  it("has no ticks when there is nothing to show", () => {
    expect(legendTicks(0, 0)).toEqual([]);
  });
});

describe("tooltip", () => {
  it("shows the value, its share of the total and its rank", () => {
    expect(tooltipText("Canada", 1_500, 2, 10_000, 40)).toBe("Canada: 1,500 (15.0%), #2 of 40");
  });

  it("says when a country has no data rather than showing 0", () => {
    expect(tooltipText("Chad", undefined, undefined, 10_000, 40)).toBe("Chad: no data");
  });

  it("ranks highest first and gives ties the same rank", () => {
    const r = ranks(new Map([["a", 5], ["b", 9], ["c", 5], ["d", 1]]));
    expect([r.get("b"), r.get("a"), r.get("c"), r.get("d")]).toEqual([1, 2, 2, 4]);
  });
});

describe("skipped values", () => {
  it("lists a few and counts the rest", () => {
    expect(skippedSummary(["HK", "SG"])).toBe("HK, SG");
    expect(skippedSummary(["A", "B", "C", "D", "E", "F", "G", "H"])).toBe("A, B, C, D, E, F and 2 more");
  });
});
