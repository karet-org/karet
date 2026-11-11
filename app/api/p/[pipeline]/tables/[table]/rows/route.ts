import { NextResponse } from "next/server";
import {
  describeSource,
  executeUserQuery,
  isVanishedFileError,
  warehouseSource,
} from "@/lib/services/duckdb";
import { BROWSE_ALIAS, buildBrowseSql, parseBrowseParams } from "@/lib/services/table-browse";
import { withRole } from "@/lib/auth/guard";

/**
 * One page of a table's rows: `?where=` (a SQL condition), `?sort=` and
 * `?dir=`, `?offset=` and `?limit=`, and `?version=` to read a retained
 * snapshot rather than what is live. Answers with the columns and their types,
 * the page, and the number of rows matching the filter.
 */
async function handleGet(
  request: Request,
  context: { params: Promise<{ pipeline: string; table: string }> },
) {
  const { pipeline, table } = await context.params;
  const params = new URL(request.url).searchParams;
  const requested = params.get("version");
  const version = requested === null ? undefined : Number(requested);
  if (version !== undefined && (!Number.isInteger(version) || version < 1)) {
    return NextResponse.json({ error: "invalid_version" }, { status: 400 });
  }

  const empty = { columns: [], rows: [], total: 0 };
  try {
    const source = await warehouseSource(pipeline, table, version);
    if (!source) return NextResponse.json(empty);

    let columns: { name: string; type: string }[];
    try {
      columns = await describeSource(source);
    } catch (err) {
      if (isVanishedFileError(err)) return NextResponse.json(empty);
      throw err;
    }

    const req = parseBrowseParams(params, columns.map((c) => c.name));
    if ("error" in req) {
      return NextResponse.json({ error: "invalid_request", message: req.error }, { status: 400 });
    }

    const relations = [{ slug: BROWSE_ALIAS, source }];
    const sql = buildBrowseSql(req);
    const [page, count] = await Promise.all([
      executeUserQuery(relations, sql.page),
      executeUserQuery(relations, sql.count),
    ]);
    if ("error" in page) {
      return NextResponse.json({ error: "query_error", message: page.error }, { status: 400 });
    }
    if ("error" in count) {
      return NextResponse.json({ error: "query_error", message: count.error }, { status: 400 });
    }
    return NextResponse.json({
      columns,
      rows: page.rows,
      total: Number(count.rows[0]?.total ?? 0),
      offset: req.offset,
      limit: req.limit,
    });
  } catch (err) {
    console.error(`GET /api/p/${pipeline}/tables/${table}/rows failed:`, err);
    return NextResponse.json(
      { error: "query_error", message: (err as Error).message },
      { status: 503 },
    );
  }
}

export const GET = withRole(handleGet);
