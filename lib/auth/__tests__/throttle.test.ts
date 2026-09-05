import { beforeEach, describe, expect, it } from "vitest";
import {
  acquire,
  clientKey,
  release,
  reset,
  _resetAllForTests,
} from "../throttle";

describe("login throttle", () => {
  beforeEach(() => _resetAllForTests());

  it("allows a burst then rate-limits, refilling over time", () => {
    const t0 = 1_000_000;
    for (let i = 0; i < 5; i++) {
      const d = acquire("ip1", t0);
      expect(d.allowed).toBe(true);
      release();
    }
    const denied = acquire("ip1", t0);
    expect(denied).toMatchObject({ allowed: false, reason: "rate_limited" });

    // One refill interval later, exactly one more attempt is allowed.
    const t1 = t0 + 15_000;
    expect(acquire("ip1", t1).allowed).toBe(true);
    release();
    expect(acquire("ip1", t1).allowed).toBe(false);
  });

  it("buckets are per client", () => {
    const t0 = 1_000_000;
    for (let i = 0; i < 5; i++) {
      expect(acquire("ip1", t0).allowed).toBe(true);
      release();
    }
    expect(acquire("ip1", t0).allowed).toBe(false);
    expect(acquire("ip2", t0).allowed).toBe(true);
    release();
  });

  it("reset forgives a client's failures", () => {
    const t0 = 1_000_000;
    for (let i = 0; i < 5; i++) {
      acquire("ip1", t0);
      release();
    }
    expect(acquire("ip1", t0).allowed).toBe(false);
    reset("ip1");
    expect(acquire("ip1", t0).allowed).toBe(true);
    release();
  });

  it("caps concurrent in-flight verifications globally", () => {
    const t0 = 1_000_000;
    // Two slots taken (not released), from different IPs.
    expect(acquire("a", t0).allowed).toBe(true);
    expect(acquire("b", t0).allowed).toBe(true);
    // Third concurrent attempt is rejected regardless of its bucket.
    expect(acquire("c", t0)).toMatchObject({ allowed: false, reason: "busy" });
    release();
    expect(acquire("c", t0).allowed).toBe(true);
    release();
    release();
  });

  it("clientKey prefers the first x-forwarded-for hop", () => {
    const req = new Request("http://x/", {
      headers: { "x-forwarded-for": "203.0.113.9, 10.0.0.1" },
    });
    expect(clientKey(req)).toBe("203.0.113.9");
    expect(clientKey(new Request("http://x/"))).toBe("unknown");
  });
});
