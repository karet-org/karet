import { describe, expect, it } from "vitest";
import { barColors, CHART_PALETTE } from "../palette";

describe("barColors", () => {
  it("gives every bar of a single dataset the same color", () => {
    expect(new Set(barColors(["a", "b", "c", "d", "e", "f", "g"], 0, null))).toEqual(new Set([CHART_PALETTE[0]]));
  });

  it("gives each dataset its own color", () => {
    expect(barColors(["a"], 1, null)).toEqual([CHART_PALETTE[1]]);
  });

  it("dims the bars other than the active filter value", () => {
    const base = CHART_PALETTE[0];
    expect(barColors(["a", "b"], 0, "b")).toEqual([base + "40", base]);
  });
});
