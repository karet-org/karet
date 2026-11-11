import { describe, expect, it } from "vitest";
import { addFieldTerm, compileSearch, formatValue, highlightTerms, likePattern, parseSearch, type SearchSyntaxError } from "../query";

const columns = [
  { name: "host", type: "VARCHAR" },
  { name: "status", type: "BIGINT" },
  { name: "duration_ms", type: "DOUBLE" },
  { name: "date", type: "DATE" },
  { name: "Path", type: "VARCHAR" },
];

function compile(q: string) {
  return compileSearch(parseSearch(q), columns, "t");
}

describe("parseSearch", () => {
  it("returns null for an empty search", () => {
    expect(parseSearch("   ")).toBeNull();
  });

  it("reads words, phrases and field terms", () => {
    expect(parseSearch('error "not found" status>=500 path="/a b"')).toEqual({
      kind: "and",
      items: [
        { kind: "text", value: "error" },
        { kind: "text", value: "not found" },
        { kind: "field", field: "status", op: ">=", value: "500" },
        { kind: "field", field: "path", op: "=", value: "/a b" },
      ],
    });
  });

  it("binds AND tighter than OR, and honours brackets", () => {
    expect(parseSearch("a b OR c")).toEqual({
      kind: "or",
      items: [{ kind: "and", items: [{ kind: "text", value: "a" }, { kind: "text", value: "b" }] }, { kind: "text", value: "c" }],
    });
    expect(parseSearch("a AND (b OR c)")).toEqual({
      kind: "and",
      items: [{ kind: "text", value: "a" }, { kind: "or", items: [{ kind: "text", value: "b" }, { kind: "text", value: "c" }] }],
    });
  });

  it("treats lower-case and, or, not as words", () => {
    expect(parseSearch("not or")).toEqual({
      kind: "and",
      items: [{ kind: "text", value: "not" }, { kind: "text", value: "or" }],
    });
  });

  it("reads NOT before a term or a bracket", () => {
    expect(parseSearch("NOT (a OR b)")).toEqual({
      kind: "not",
      item: { kind: "or", items: [{ kind: "text", value: "a" }, { kind: "text", value: "b" }] },
    });
  });

  it("unescapes quotes inside a phrase", () => {
    expect(parseSearch('"say \\"hi\\""')).toEqual({ kind: "text", value: 'say "hi"' });
  });

  it.each([
    ['"open', "A quote is not closed."],
    ["(a", "A bracket is not closed."],
    ["a)", "Unexpected )."],
    ["a OR", "The search ends where a term was expected."],
    ["status=", "status= needs a value."],
    ["NOT", "The search ends where a term was expected."],
  ])("rejects %s", (q, message) => {
    expect(() => parseSearch(q)).toThrow(message);
  });

  it("gives the position of a syntax error", () => {
    try {
      parseSearch('a "open');
    } catch (err) {
      expect((err as SearchSyntaxError).position).toBe(2);
    }
    expect.assertions(1);
  });
});

describe("compileSearch", () => {
  it("matches everything for an empty search", () => {
    expect(compileSearch(null, columns, "t")).toEqual({ sql: "true", values: [], usesText: false });
  });

  it("matches free text in the lower-case text column", () => {
    expect(compile("Error")).toEqual({ sql: "COALESCE(contains(t, ?), false)", values: ["error"], usesText: true });
    expect(compile("wp-*.php")).toEqual({
      sql: "COALESCE(t LIKE ? ESCAPE '\\', false)",
      values: ["%wp-%.php%"],
      usesText: true,
    });
  });

  it("compares numbers as numbers", () => {
    expect(compile("status>=500")).toEqual({
      sql: 'COALESCE("status" >= CAST(? AS DOUBLE), false)',
      values: ["500"],
      usesText: false,
    });
  });

  it("matches text fields without regard to case", () => {
    expect(compile("host=GIT.example.org").sql).toBe('COALESCE(lower(CAST("host" AS VARCHAR)) = lower(?), false)');
  });

  it("finds a field whatever its case", () => {
    expect(compile("path=/a").sql).toContain('"Path"');
  });

  it("turns * into a LIKE wildcard on a field", () => {
    expect(compile("host=git*")).toMatchObject({
      sql: `COALESCE(CAST("host" AS VARCHAR) ILIKE ? ESCAPE '\\', false)`,
      values: ["git%"],
    });
  });

  it("reads field=* as present and field!=* as missing", () => {
    expect(compile("host=*").sql).toBe('"host" IS NOT NULL');
    expect(compile("host!=*").sql).toBe('"host" IS NULL');
  });

  it("keeps rows with no value under NOT", () => {
    expect(compile("NOT host=a").sql).toBe('(NOT COALESCE(lower(CAST("host" AS VARCHAR)) = lower(?), false))');
  });

  it("casts the value for a date field", () => {
    expect(compile("date>2026-01-01").sql).toBe('COALESCE("date" > TRY_CAST(? AS DATE), false)');
  });

  it("binds every value and never puts it in the SQL", () => {
    const c = compile(`host="'; DROP TABLE x; --" status=1`);
    expect(c.sql).not.toContain("DROP");
    expect(c.values).toEqual(["'; DROP TABLE x; --", "1"]);
  });

  it.each([
    ["nope=1", 'No field named "nope".'],
    ["status=abc", 'status holds numbers, so "abc" cannot match it.'],
    ["host>a*", "host> cannot take a wildcard."],
  ])("rejects %s", (q, message) => {
    expect(() => compile(q)).toThrow(message);
  });
});

describe("likePattern", () => {
  it("escapes LIKE characters and maps * to %", () => {
    expect(likePattern("50%_off\\*")).toBe("50\\%\\_off\\\\%");
  });
});

describe("formatValue and addFieldTerm", () => {
  it("quotes values the parser would split or read as a keyword", () => {
    expect(formatValue("git.example.org")).toBe("git.example.org");
    expect(formatValue("Mozilla/5.0 (X11)")).toBe('"Mozilla/5.0 (X11)"');
    expect(formatValue('a"b')).toBe('"a\\"b"');
    expect(formatValue("OR")).toBe('"OR"');
  });

  it("reads back what it writes", () => {
    for (const v of ["a b", 'q"uote', "back\\slash", "(x)", "NOT"]) {
      expect(parseSearch(addFieldTerm("", "host", v))).toEqual({ kind: "field", field: "host", op: "=", value: v });
    }
  });

  it("adds a term, or an excluding term", () => {
    expect(addFieldTerm("", "host", "a")).toBe("host=a");
    expect(addFieldTerm("error", "host", "a")).toBe("error host=a");
    expect(addFieldTerm("error", "host", "a", true)).toBe("error NOT host=a");
  });

  it("brackets a search with a top-level OR", () => {
    expect(addFieldTerm("a OR b", "host", "x")).toBe("(a OR b) host=x");
    expect(addFieldTerm("(a OR b) c", "host", "x")).toBe("(a OR b) c host=x");
  });
});

describe("highlightTerms", () => {
  it("lists free-text words outside NOT", () => {
    expect(highlightTerms(parseSearch('error "not found" NOT debug host=a wp-*.php error'))).toEqual(["error", "not found", ".php"]);
    expect(highlightTerms(null)).toEqual([]);
  });
});
