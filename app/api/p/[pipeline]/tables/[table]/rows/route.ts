import { NextResponse } from "next/server";
import { loadTableRowsDuckDB } from "@/lib/services/duckdb";
import { withRole } from "@/lib/auth/guard";

async function handleGet(
  request: Request,
  context: { params: Promise<{ pipeline: string; table: string }> },
) {
  const { pipeline, table } = await context.params;
  // `?version=` reads a retained snapshot rather than what is live.
  const requested = new URL(request.url).searchParams.get("version");
  const version = requested === null ? undefined : Number(requested);
  if (version !== undefined && (!Number.isInteger(version) || version < 1)) {
    return NextResponse.json({ error: "invalid_version" }, { status: 400 });
  }

  try {
    const rows = await loadTableRowsDuckDB(pipeline, table, version);
    return NextResponse.json({ rows });
  } catch (err) {
    console.error(`GET /api/p/${pipeline}/tables/${table}/rows failed:`, err);
    return NextResponse.json(
      { error: "query_error", message: (err as Error).message },
      { status: 503 },
    );
  }
}

export const GET = withRole(handleGet);
