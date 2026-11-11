import { describe, expect, it } from "vitest";
import { cellText, isNumericColumn, nextSort, sortRows, toCsv } from "../grid";

describe("cellText", () => {
  it("returns null for SQL NULL so the grid can show NULL", () => {
    expect(cellText(null)).toBeNull();
    expect(cellText(undefined)).toBeNull();
    expect(cellText("")).toBe("");
  });

  it("shortens midnight timestamps and stringifies objects", () => {
    expect(cellText("2026-11-10T00:00:00.000Z")).toBe("2026-11-10");
    expect(cellText({ a: 1 })).toBe('{"a":1}');
    expect(cellText(42)).toBe("42");
  });
});

describe("sorting", () => {
  it("cycles a header through ascending, descending and unsorted", () => {
    let s = nextSort(null, "ts");
    expect(s).toEqual({ column: "ts", dir: "asc" });
    s = nextSort(s, "ts");
    expect(s).toEqual({ column: "ts", dir: "desc" });
    expect(nextSort(s, "ts")).toBeNull();
    expect(nextSort(s, "path")).toEqual({ column: "path", dir: "asc" });
  });

  it("sorts numbers numerically and keeps nulls last both ways", () => {
    const rows = [{ n: 10 }, { n: null }, { n: 9 }, { n: 100 }];
    expect(sortRows(rows, { column: "n", dir: "asc" }).map((r) => r.n)).toEqual([9, 10, 100, null]);
    expect(sortRows(rows, { column: "n", dir: "desc" }).map((r) => r.n)).toEqual([100, 10, 9, null]);
    expect(sortRows(rows, null)).toBe(rows);
  });
});

describe("toCsv", () => {
  it("quotes fields with commas, quotes or newlines, and leaves NULL empty", () => {
    const csv = toCsv(["a", "b"], [
      { a: "x,y", b: 'say "hi"' },
      { a: null, b: "line\nbreak" },
      { a: 3, b: "2026-11-10T00:00:00.000Z" },
    ]);
    expect(csv).toBe('a,b\r\n"x,y","say ""hi"""\r\n,"line\nbreak"\r\n3,2026-11-10T00:00:00.000Z\r\n');
  });
});

describe("isNumericColumn", () => {
  it("right-aligns numeric DuckDB types and leaves text and dates alone", () => {
    expect(isNumericColumn("BIGINT", undefined)).toBe(true);
    expect(isNumericColumn("DOUBLE", undefined)).toBe(true);
    expect(isNumericColumn("VARCHAR", 5)).toBe(false);
    expect(isNumericColumn("DATE", undefined)).toBe(false);
    expect(isNumericColumn(undefined, 5)).toBe(true);
  });
});
