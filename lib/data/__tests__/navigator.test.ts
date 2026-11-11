import { describe, expect, it } from "vitest";
import { ageLabel, clampNavWidth, filterNavigator, NAV_MAX_WIDTH, NAV_MIN_WIDTH, rowsLabel } from "../navigator";
import type { TableInfo } from "@/components/data/types";

function table(id: string, name: string, columns: string[]): TableInfo {
  return {
    id,
    name,
    slug: id,
    schema: columns.map((c) => ({ name: c, type: "string" })),
    partitionKeys: [],
    dedupKeys: [],
    fileCount: 1,
    version: 1,
    rowCount: 10,
    publishedAt: null,
    collidesWith: null,
  };
}

const TABLES = [table("requests", "Requests", ["ts", "path", "user_agent"]), table("transactions", "Transactions", ["date", "amount"])];
const QUERIES = [
  { id: "slow_paths", name: "Slow paths", sql: "SELECT 1" },
  { id: "monthly_spend", name: "Monthly spend", sql: "SELECT 2" },
];

describe("filterNavigator", () => {
  it("shows everything when the filter is empty", () => {
    const m = filterNavigator(TABLES, QUERIES, "  ");
    expect(m.tables.map((t) => t.table.id)).toEqual(["requests", "transactions"]);
    expect(m.queries).toHaveLength(2);
  });

  it("keeps all columns of a table whose name matches", () => {
    const m = filterNavigator(TABLES, QUERIES, "REQ");
    expect(m.tables).toHaveLength(1);
    expect(m.tables[0].columns.map((c) => c.name)).toEqual(["ts", "path", "user_agent"]);
    expect(m.tables[0].matchedColumns).toBe(false);
  });

  it("lists only the matching columns when just columns match", () => {
    const m = filterNavigator(TABLES, QUERIES, "agent");
    expect(m.tables.map((t) => t.table.id)).toEqual(["requests"]);
    expect(m.tables[0].columns.map((c) => c.name)).toEqual(["user_agent"]);
    expect(m.tables[0].matchedColumns).toBe(true);
  });

  it("filters saved queries by name", () => {
    expect(filterNavigator(TABLES, QUERIES, "spend").queries.map((q) => q.id)).toEqual(["monthly_spend"]);
  });
});

describe("labels", () => {
  it("shortens row counts", () => {
    expect(rowsLabel(1)).toBe("1 row");
    expect(rowsLabel(999)).toBe("999 rows");
    expect(rowsLabel(2_995_886)).toBe("3M rows");
    expect(rowsLabel(null)).toBeNull();
  });

  it("says how long ago a table was published", () => {
    const now = Date.parse("2026-11-10T12:00:00Z");
    expect(ageLabel("2026-11-10T11:59:30Z", now)).toBe("just now");
    expect(ageLabel("2026-11-10T11:55:00Z", now)).toBe("5 min ago");
    expect(ageLabel("2026-11-10T09:00:00Z", now)).toBe("3 h ago");
    expect(ageLabel("2026-11-08T12:00:00Z", now)).toBe("2 d ago");
    expect(ageLabel(null, now)).toBeNull();
  });

  it("keeps the navigator width within its limits", () => {
    expect(clampNavWidth(10)).toBe(NAV_MIN_WIDTH);
    expect(clampNavWidth(10_000)).toBe(NAV_MAX_WIDTH);
    expect(clampNavWidth(300.4)).toBe(300);
  });
});
