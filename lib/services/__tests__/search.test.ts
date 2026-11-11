import { describe, expect, it } from "vitest";
import {
  baseRelation,
  eventsSql,
  fillHistogram,
  histogramFrame,
  histogramSql,
  planSearch,
  type SearchPlan,
} from "../search";

const columns = [
  { name: "ts", type: "DOUBLE" },
  { name: "host", type: "VARCHAR" },
  { name: "status", type: "BIGINT" },
];
const NOW = 1_800_000_000;

function plan(query: Record<string, string>): SearchPlan {
  const p = planSearch(new URLSearchParams(query), columns, NOW);
  if ("error" in p) throw new Error(p.error);
  return p;
}

describe("planSearch", () => {
  it("uses a preset range ending now", () => {
    expect(plan({ q: "", range: "1h" }).range).toEqual({ from: NOW - 3600, to: NOW });
    expect(plan({ q: "" }).range).toBeNull();
  });

  it("takes an explicit range", () => {
    const p = plan({ from: "100", to: "200" });
    expect(p.range).toEqual({ from: 100, to: 200 });
    expect(p.where).toBe("true AND _karet_time >= 100 AND _karet_time < 200");
  });

  it("detects the time field and lets the request override it", () => {
    expect(plan({}).timeField).toBe("ts");
    expect(plan({ timeField: "none", range: "1h" })).toMatchObject({ timeField: null, range: null });
  });

  it.each([
    [{ from: "200", to: "100" }, "from and to must be epoch seconds with from before to."],
    [{ from: "1" }, "from and to must be epoch seconds with from before to."],
    [{ range: "2y" }, 'Unknown time range "2y".'],
    [{ timeField: "nope" }, 'No column named "nope".'],
    [{ limit: "500" }, "limit must be between 0 and 200."],
    [{ offset: "-1" }, "offset must be a whole number of 0 or more."],
    [{ q: "(a" }, "A bracket is not closed."],
  ])("rejects %o", (query, error) => {
    expect(planSearch(new URLSearchParams(query), columns, NOW)).toMatchObject({ error });
  });
});

describe("search SQL", () => {
  it("adds the text column only when the search has free text", () => {
    expect(baseRelation(plan({ q: "status=1" }))).not.toContain("_karet_text");
    expect(baseRelation(plan({ q: "error" }))).toContain("lower(concat_ws(' ', ");
  });

  it("orders events newest first and leaves out the text column", () => {
    const sql = eventsSql(plan({ q: "error", limit: "10", offset: "20" }));
    expect(sql).toMatch(/^SELECT \* EXCLUDE \(_karet_text\) FROM/);
    expect(sql).toContain("ORDER BY _karet_time DESC NULLS LAST\nLIMIT 10 OFFSET 20");
  });

  it("buckets from a frame aligned to the interval", () => {
    const frame = histogramFrame({ from: 1000, to: 4600 }, null, null);
    expect(frame).toEqual({ start: 960, interval: 60, buckets: 61 });
    expect(histogramSql(plan({}), frame!)).toContain("floor((_karet_time - 960) / 60)");
  });

  it("frames all time from the first to the last event", () => {
    expect(histogramFrame(null, 0, 3599)).toEqual({ start: 0, interval: 60, buckets: 60 });
    expect(histogramFrame(null, null, null)).toBeNull();
  });

  it("fills empty bars with zero and skips rows with no time", () => {
    const frame = { start: 0, interval: 60, buckets: 4 };
    expect(fillHistogram(frame, [{ bucket: 1, n: 5 }, { bucket: 3, n: 2 }, { bucket: null, n: 9 }, { bucket: 7, n: 1 }])).toEqual([0, 5, 0, 2]);
  });
});
