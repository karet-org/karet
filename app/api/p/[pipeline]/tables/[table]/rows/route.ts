import { NextResponse } from "next/server";
import { loadTableRowsDuckDB } from "@/lib/services/duckdb";

export async function GET(
  _request: Request,
  context: { params: Promise<{ pipeline: string; table: string }> },
) {
  const { pipeline, table } = await context.params;

  try {
    const rows = await loadTableRowsDuckDB(pipeline, table);
    return NextResponse.json({ rows });
  } catch (err) {
    console.error(`GET /api/p/${pipeline}/tables/${table}/rows failed:`, err);
    return NextResponse.json(
      { error: "query_error", message: (err as Error).message },
      { status: 503 },
    );
  }
}
