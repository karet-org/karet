// RustFS object-event webhook receiver.
//
// RustFS POSTs S3-style event payloads here when configured with
// `RUSTFS_NOTIFY_WEBHOOK_*` (mirrors MinIO's webhook target). Each event
// references one bucket key; we filter for `pipelines/<slug>/raw/...`
// and schedule a debounced pipeline run for that slug so a batch upload
// becomes a single job.

import { NextResponse } from "next/server";
import { sanitizeSlug } from "@/lib/config/slug";
import { scheduleRun } from "@/lib/services/job-debouncer";

export const runtime = "nodejs";

interface S3EventRecord {
  eventName?: string;
  s3?: {
    bucket?: { name?: string };
    object?: { key?: string };
  };
}

interface S3EventPayload {
  Records?: S3EventRecord[];
}

/**
 * Pull `<slug>` out of `pipelines/<slug>/raw/...` style keys. Returns null
 * if the key doesn't match the layout (e.g. clean output, jobs records,
 * or auth files we don't want to react to).
 */
function pipelineSlugFromKey(rawKey: string): string | null {
  // RustFS URL-encodes some characters in the event payload (consistent
  // with S3 spec). Decode first so we match the in-bucket layout.
  let key: string;
  try {
    key = decodeURIComponent(rawKey);
  } catch {
    key = rawKey;
  }
  const match = /^pipelines\/([^/]+)\/raw\//.exec(key);
  if (!match) return null;
  const slug = sanitizeSlug(match[1]);
  return slug || null;
}

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

/**
 * Verifies the shared-secret. Accepts the value via three channels so
 * different webhook clients can use whichever they support:
 *
 *   - `Authorization: Bearer <secret>` (preferred — what most clients send)
 *   - `X-Webhook-Secret: <secret>`     (fallback header)
 *   - `?secret=<secret>` query param   (last resort for clients that
 *     can't customize headers; safe when the receiver is on a private
 *     compose network)
 *
 * Returns false if no secret is configured — fail closed.
 */
function isAuthorized(request: Request): boolean {
  const expected = process.env.KARET_WEBHOOK_SECRET;
  if (!expected || expected.length === 0) return false;
  const auth = request.headers.get("authorization");
  if (auth) {
    const m = /^Bearer\s+(.+)$/i.exec(auth);
    if (m && timingSafeEqual(m[1], expected)) return true;
  }
  const raw = request.headers.get("x-webhook-secret");
  if (raw && timingSafeEqual(raw, expected)) return true;
  const qs = new URL(request.url).searchParams.get("secret");
  if (qs && timingSafeEqual(qs, expected)) return true;
  return false;
}

export async function POST(request: Request) {
  if (!isAuthorized(request)) {
    return NextResponse.json(
      { error: "unauthorized", message: "missing or invalid webhook secret" },
      { status: 401 },
    );
  }

  let payload: S3EventPayload;
  try {
    payload = (await request.json()) as S3EventPayload;
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }

  const records = Array.isArray(payload.Records) ? payload.Records : [];
  const scheduled = new Set<string>();
  for (const rec of records) {
    // Only react to object-create events. RustFS may also fire delete /
    // restore events that we don't want to trigger pipeline runs.
    const eventName = rec.eventName ?? "";
    if (!eventName.startsWith("s3:ObjectCreated:")) continue;
    const key = rec.s3?.object?.key;
    if (!key) continue;
    const slug = pipelineSlugFromKey(key);
    if (!slug) continue;
    scheduleRun(slug);
    scheduled.add(slug);
  }

  return NextResponse.json({
    received: records.length,
    scheduled: Array.from(scheduled),
  });
}
