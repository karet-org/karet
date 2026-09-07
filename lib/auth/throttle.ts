// Login throttling: scrypt costs ~128 MiB / ~0.5 s and the login route is
// session-exempt, so a per-IP bucket plus a global in-flight cap bound memory
// however many IPs an attacker rotates. State is per-process, which only
// loosens the bound by the replica count.

const ATTEMPT_BURST = 5;
const ATTEMPT_REFILL_MS = 15_000;
/** In-flight scrypt cap: 2 × ~128 MiB worst case is an acceptable bound. */
const MAX_CONCURRENT_VERIFICATIONS = 2;
/** Bucket table cap; oldest entries are evicted (IP-rotating attackers hit the
 * global concurrency cap anyway). */
const MAX_TRACKED_IPS = 10_000;

interface Bucket {
  tokens: number;
  lastRefillMs: number;
}

const buckets = new Map<string, Bucket>();
let inFlight = 0;

/** Client identifier: behind the ALB the first `x-forwarded-for` hop. Bare
 * compose exposes no address, so everything shares one bucket — acceptable,
 * the admin and the attacker contend equally there. */
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
 * Reserve capacity for one verification attempt. On `allowed: true` the caller
 * MUST call `release()` (and may call `reset(key)` on success).
 */
export function acquire(key: string, now = Date.now()): ThrottleDecision {
  if (inFlight >= MAX_CONCURRENT_VERIFICATIONS) {
    return { allowed: false, reason: "busy", retryAfterS: 2 };
  }

  let bucket = buckets.get(key);
  if (!bucket) {
    if (buckets.size >= MAX_TRACKED_IPS) {
      // Map preserves insertion order, so this is the oldest entry.
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
