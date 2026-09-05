// Server-sent events: live job updates for one pipeline.
//
// The worker publishes a job id on karet:jobs:events:<pipeline> after
// every live-hash write; each event here carries the full JobRecord read
// back from the hash. Best-effort: the jobs page keeps a slow poll as
// reconciliation, so a dropped connection only delays updates.

import { liveHashToRecord } from "@/lib/services/live-jobs";
import { eventsChannel, getRedis, liveKey } from "@/lib/services/redis";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const PING_MS = 25_000;

export async function GET(
  request: Request,
  context: { params: Promise<{ pipeline: string }> },
) {
  const { pipeline } = await context.params;
  // Pub/sub needs a dedicated connection; the shared client keeps
  // serving queries.
  const subscriber = (await getRedis()).duplicate();
  await subscriber.connect();

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      let closed = false;
      const ping = setInterval(() => {
        try {
          controller.enqueue(encoder.encode(`: ping\n\n`));
        } catch {
          void close();
        }
      }, PING_MS);

      const close = async () => {
        if (closed) return;
        closed = true;
        clearInterval(ping);
        try {
          await subscriber.unsubscribe();
          subscriber.destroy();
        } catch {}
        try {
          controller.close();
        } catch {}
      };

      request.signal.addEventListener("abort", () => void close());

      await subscriber.subscribe(eventsChannel(pipeline), async (jobId) => {
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
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
    },
  });
}
