// Paged, sorted, filtered reads of one warehouse table for the Data page's
// table browser. The SQL runs through the same read-only path as the query
// endpoint, against the table exposed under a fixed alias.

/** Name the table is exposed under inside a browse query. */
export const BROWSE_ALIAS = "browse_rows";
export const DEFAULT_PAGE_SIZE = 100;
export const MAX_PAGE_SIZE = 500;
const MAX_WHERE_LENGTH = 2000;

export interface BrowseRequest {
  /** A SQL boolean expression over the table's columns, or empty. */
  where: string;
  sort: { column: string; dir: "asc" | "desc" } | null;
  offset: number;
  limit: number;
}

function quoteIdent(name: string): string {
  return `"${name.replace(/"/g, '""')}"`;
}

function nonNegativeInt(raw: string | null, fallback: number): number | null {
  if (raw === null || raw === "") return fallback;
  const n = Number(raw);
  return Number.isInteger(n) && n >= 0 ? n : null;
}

/**
 * Read and check the browse parameters. `sort` must name one of `columns`,
 * since it is placed in the SQL as an identifier rather than bound.
 */
export function parseBrowseParams(
  params: URLSearchParams,
  columns: string[],
): BrowseRequest | { error: string } {
  const where = (params.get("where") ?? "").trim();
  if (where.length > MAX_WHERE_LENGTH) {
    return { error: `The filter is longer than ${MAX_WHERE_LENGTH} characters.` };
  }

  const offset = nonNegativeInt(params.get("offset"), 0);
  const limit = nonNegativeInt(params.get("limit"), DEFAULT_PAGE_SIZE);
  if (offset === null) return { error: "offset must be a whole number of 0 or more." };
  if (limit === null || limit < 1 || limit > MAX_PAGE_SIZE) {
    return { error: `limit must be between 1 and ${MAX_PAGE_SIZE}.` };
  }

  const column = params.get("sort");
  let sort: BrowseRequest["sort"] = null;
  if (column) {
    if (!columns.includes(column)) return { error: `No column named "${column}".` };
    const dir = params.get("dir") === "desc" ? "desc" : "asc";
    sort = { column, dir };
  }
  return { where, sort, offset, limit };
}

/**
 * The page query and the matching row count. The filter goes on its own line
 * so a `--` comment in it cannot comment out the ORDER BY and LIMIT after it.
 */
export function buildBrowseSql(req: BrowseRequest): { page: string; count: string } {
  const filter = req.where ? `\nWHERE (${req.where}\n)` : "";
  const order = req.sort
    ? `\nORDER BY ${quoteIdent(req.sort.column)} ${req.sort.dir.toUpperCase()} NULLS LAST`
    : "";
  return {
    page: `SELECT * FROM ${BROWSE_ALIAS}${filter}${order}\nLIMIT ${req.limit} OFFSET ${req.offset}`,
    count: `SELECT count(*) AS total FROM ${BROWSE_ALIAS}${filter}`,
  };
}
