import { NextResponse } from "next/server";
import { withRole } from "@/lib/auth/guard";
import {
  boundsSql,
  countSql,
  eventsSql,
  fillHistogram,
  histogramFrame,
  histogramSql,
  latestSql,
  TIME_COLUMN,
  type HistogramFrame,
} from "@/lib/services/search";
import { prepareSearch, SearchQueryError } from "@/lib/services/search-run";

export const dynamic = "force-dynamic";

function numberOrNull(v: unknown): number | null {
  return v === null || v === undefined ? null : Number(v);
}

/**
 * Search one table: `?table=&q=` with `range=` or `from=&to=`, `timeField=`,
 * `offset=` and `limit=`. Answers with the matching events newest first, the
 * total, and a histogram of matches over time.
 */
async function handleGet(request: Request, context: { params: Promise<{ pipeline: string }> }) {
  const { pipeline } = await context.params;
  const params = new URL(request.url).searchParams;
  try {
    const prepared = await prepareSearch(pipeline, params);
    if (prepared.kind === "empty") {
      return NextResponse.json({ columns: [], timeField: null, total: 0, events: [], histogram: null, range: null, latest: null });
    }
    if (prepared.kind === "invalid") {
      return NextResponse.json(
        { error: "invalid_search", message: prepared.message, position: prepared.position ?? null },
        { status: 400 },
      );
    }
    const { plan, run } = prepared;

    // The histogram's frame comes from the range, or from the table's first
    // and last event, so the bars can be counted alongside the events page
    // and give the total.
    let frame: HistogramFrame | null = null;
    if (plan.timeField) {
      if (plan.range) frame = histogramFrame(plan.range, null, null);
      else {
        const [b] = await run(boundsSql(plan), []);
        frame = histogramFrame(null, numberOrNull(b?.first_time), numberOrNull(b?.last_time));
      }
    }
    let total: number;
    let bars: Record<string, unknown>[] = [];
    let events: Record<string, unknown>[];
    if (frame) {
      [bars, events] = await Promise.all([run(histogramSql(plan, frame)), run(eventsSql(plan))]);
      total = bars.reduce((sum, b) => sum + Number(b.n), 0);
    } else {
      const [count, page] = await Promise.all([run(countSql(plan)), run(eventsSql(plan))]);
      events = page;
      total = Number(count[0]?.total ?? 0);
    }
    const latest = plan.range && total === 0 ? await run(latestSql(plan)) : null;

    return NextResponse.json({
      columns: plan.columns,
      timeField: plan.timeField,
      total,
      offset: plan.offset,
      limit: plan.limit,
      events: events.map(({ [TIME_COLUMN]: time, ...row }) => ({ time: numberOrNull(time), row })),
      range: plan.range,
      histogram: frame ? { ...frame, counts: fillHistogram(frame, bars as { bucket: unknown; n: unknown }[]) } : null,
      latest: latest ? numberOrNull(latest[0]?.last_time) : null,
    });
  } catch (err) {
    if (err instanceof SearchQueryError) {
      return NextResponse.json({ error: "query_error", message: err.message }, { status: 400 });
    }
    console.error(`GET /api/p/${pipeline}/search failed:`, err);
    return NextResponse.json({ error: "query_error", message: (err as Error).message }, { status: 503 });
  }
}

export const GET = withRole(handleGet);
