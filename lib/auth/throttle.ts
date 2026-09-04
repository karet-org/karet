// Login throttling.
//
// scrypt verification at our parameters costs ~128 MiB and ~0.5 s per
// attempt — deliberately expensive for attackers with a stolen hash, but
// that same cost makes an unthrottled login endpoint a remote OOM/CPU
// lever (it is necessarily exempt from the session middleware). Two
// independent guards:
//
//   1. A per-IP token bucket: burst of ATTEMPT_BURST, refilling one
//      attempt every ATTEMPT_REFILL_MS. Successful login resets the
//      bucket, so a legitimate admin who fat-fingers twice isn't locked
//      out after signing in.
//   2. A global concurrency cap on in-flight scrypt verifications,
//      bounding worst-case memory regardless of how many source IPs an
//      attacker rotates through.
//
// State is in-memory and per-process — consistent with the single-replica
// web deployment; multiple replicas would each enforce their own bucket,
// which merely loosens the bound by the replica count.

const ATTEMPT_BURST = 5;
const ATTEMPT_REFILL_MS = 15_000;
/** In-flight scrypt cap: 2 × ~128 MiB worst case is an acceptable bound. */
const MAX_CONCURRENT_VERIFICATIONS = 2;
/** Bucket table cap; oldest entries are evicted (attackers rotating IPs
 * hit the global concurrency cap anyway). */
const MAX_TRACKED_IPS = 10_000;

interface Bucket {
  tokens: number;
  lastRefillMs: number;
}

const buckets = new Map<string, Bucket>();
let inFlight = 0;

/** Extract a client identifier from the request. Behind the ALB/proxy the
 * first `x-forwarded-for` hop is the client; bare compose exposes no
 * address to route handlers, so everything shares one bucket — fine, the
 * legitimate admin and the attacker contend equally there. */
export function clientKey(request: Request): string {
  const xff = request.headers.get("x-forwarded-for");
  if (xff) {
    const first = xff.split(",")[0]?.trim();
    if (first) return first;
  }
  return "unknown";
}

export type ThrottleDecision =
  | { allowed: true }
  | { allowed: false; reason: "rate_limited" | "busy"; retryAfterS: number };

/**
 * Reserve capacity for one verification attempt. On `allowed: true` the
 * caller MUST call `release()` (and may call `reset(key)` on success).
 */
export function acquire(key: string, now = Date.now()): ThrottleDecision {
  if (inFlight >= MAX_CONCURRENT_VERIFICATIONS) {
    return { allowed: false, reason: "busy", retryAfterS: 2 };
  }

  let bucket = buckets.get(key);
  if (!bucket) {
    if (buckets.size >= MAX_TRACKED_IPS) {
      // Evict the oldest entry (Map preserves insertion order).
      const oldest = buckets.keys().next().value;
      if (oldest !== undefined) buckets.delete(oldest);
    }
    bucket = { tokens: ATTEMPT_BURST, lastRefillMs: now };
    buckets.set(key, bucket);
  } else {
    const refill = Math.floor((now - bucket.lastRefillMs) / ATTEMPT_REFILL_MS);
    if (refill > 0) {
      bucket.tokens = Math.min(ATTEMPT_BURST, bucket.tokens + refill);
      bucket.lastRefillMs = now;
    }
  }

  if (bucket.tokens <= 0) {
    const nextTokenMs = bucket.lastRefillMs + ATTEMPT_REFILL_MS - now;
    return {
      allowed: false,
      reason: "rate_limited",
      retryAfterS: Math.max(1, Math.ceil(nextTokenMs / 1000)),
    };
  }

  bucket.tokens -= 1;
  inFlight += 1;
  return { allowed: true };
}

/** Release the in-flight slot taken by `acquire`. */
export function release(): void {
  inFlight = Math.max(0, inFlight - 1);
}

/** Forgive past failures for this client (call after successful login). */
export function reset(key: string): void {
  buckets.delete(key);
}

/** Test hook: wipe all throttle state. */
export function _resetAllForTests(): void {
  buckets.clear();
  inFlight = 0;
}
