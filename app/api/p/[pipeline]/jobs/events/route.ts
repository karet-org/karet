// Server-sent events: live job updates for one pipeline.
//
// The worker publishes a job id on karet:jobs:events:<pipeline> after
// every live-hash write; each event here carries the full JobRecord read
// back from the hash. Best-effort: the jobs page keeps a slow poll as
// reconciliation.
//
// Every stream owns a dedicated Redis subscriber connection, so cleanup
// must run on every exit path (client abort, stream cancel, subscribe
// failure) and concurrent streams are capped.

import { liveHashToRecord } from "@/lib/services/live-jobs";
import { eventsChannel, getRedis, liveKey } from "@/lib/services/redis";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const PING_MS = 25_000;
const MAX_STREAMS = 8;
let activeStreams = 0;

export async function GET(
  request: Request,
  context: { params: Promise<{ pipeline: string }> },
) {
  const { pipeline } = await context.params;
  if (activeStreams >= MAX_STREAMS) {
    return Response.json(
      { error: "too_many_streams", message: "Too many open event streams." },
      { status: 503, headers: { "Retry-After": "5" } },
    );
  }
  if (request.signal.aborted) return new Response(null, { status: 204 });

  activeStreams += 1;
  let subscriber: Awaited<ReturnType<typeof getRedis>> | null = null;
  let closed = false;
  let ping: ReturnType<typeof setInterval> | undefined;
  const close = async (controller?: ReadableStreamDefaultController) => {
    if (closed) return;
    closed = true;
    activeStreams -= 1;
    clearInterval(ping);
    try {
      await subscriber?.unsubscribe();
      subscriber?.destroy();
    } catch {}
    try {
      controller?.close();
    } catch {}
  };

  try {
    subscriber = (await getRedis()).duplicate();
    await subscriber.connect();
  } catch (err) {
    console.error(`SSE subscriber connect failed for ${pipeline}:`, err);
    await close();
    return Response.json({ error: "redis_unavailable" }, { status: 503 });
  }
  // The client may have gone away during the connect.
  if (request.signal.aborted) {
    await close();
    return new Response(null, { status: 204 });
  }

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      ping = setInterval(() => {
        try {
          controller.enqueue(encoder.encode(`: ping\n\n`));
        } catch {
          void close(controller);
        }
      }, PING_MS);

      request.signal.addEventListener("abort", () => void close(controller));

      try {
        await subscriber!.subscribe(eventsChannel(pipeline), async (jobId) => {
          try {
            const redis = await getRedis();
            const hash = await redis.hGetAll(liveKey(jobId));
            const record = liveHashToRecord(jobId, pipeline, hash);
            if (record && !closed) {
              controller.enqueue(encoder.encode(`data: ${JSON.stringify(record)}\n\n`));
            }
          } catch (err) {
            console.error(`job event relay failed for ${pipeline}/${jobId}:`, err);
          }
        });
      } catch (err) {
        console.error(`SSE subscribe failed for ${pipeline}:`, err);
        await close(controller);
      }
    },
    cancel() {
      void close();
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
