import { describe, expect, it } from "vitest";
import { BROWSE_ALIAS, buildBrowseSql, MAX_PAGE_SIZE, parseBrowseParams } from "../table-browse";

const COLUMNS = ["ts", "path", "status", 'odd"name'];
const parse = (q: string) => parseBrowseParams(new URLSearchParams(q), COLUMNS);

describe("parseBrowseParams", () => {
  it("defaults to the first page, unsorted and unfiltered", () => {
    expect(parse("")).toEqual({ where: "", sort: null, offset: 0, limit: 100 });
  });

  it("reads the filter, sort and paging", () => {
    expect(parse("where=status>=500&sort=ts&dir=desc&offset=200&limit=50")).toEqual({
      where: "status>=500",
      sort: { column: "ts", dir: "desc" },
      offset: 200,
      limit: 50,
    });
  });

  it("refuses to sort by a column the table does not have", () => {
    expect(parse("sort=password")).toEqual({ error: 'No column named "password".' });
  });

  it("refuses page sizes and offsets out of range", () => {
    expect(parse(`limit=${MAX_PAGE_SIZE + 1}`)).toHaveProperty("error");
    expect(parse("limit=0")).toHaveProperty("error");
    expect(parse("offset=-1")).toHaveProperty("error");
    expect(parse("offset=1.5")).toHaveProperty("error");
  });

  it("refuses a filter longer than 2000 characters", () => {
    expect(parse(`where=${"a".repeat(2001)}`)).toHaveProperty("error");
  });
});

describe("buildBrowseSql", () => {
  it("pages, sorts with nulls last, and counts the same rows", () => {
    const sql = buildBrowseSql({ where: "status >= 500", sort: { column: "ts", dir: "desc" }, offset: 100, limit: 50 });
    expect(sql.page).toBe(
      `SELECT * FROM ${BROWSE_ALIAS}\nWHERE (status >= 500\n)\nORDER BY "ts" DESC NULLS LAST\nLIMIT 50 OFFSET 100`,
    );
    expect(sql.count).toBe(`SELECT count(*) AS total FROM ${BROWSE_ALIAS}\nWHERE (status >= 500\n)`);
  });

  it("quotes the sort column", () => {
    const sql = buildBrowseSql({ where: "", sort: { column: 'odd"name', dir: "asc" }, offset: 0, limit: 10 });
    expect(sql.page).toContain('ORDER BY "odd""name" ASC');
  });

  it("keeps the LIMIT when the filter ends in a line comment", () => {
    const { page } = buildBrowseSql({ where: "1=1 -- drop the limit", sort: null, offset: 0, limit: 10 });
    const lastLine = page.split("\n").at(-1);
    expect(lastLine).toBe("LIMIT 10 OFFSET 0");
  });
});
