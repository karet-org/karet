import { describe, it, expect } from "vitest";
import { signSession, verifySession } from "../session";

const SECRET = "test-secret-do-not-use-in-prod";

describe("session", () => {
  it("round-trips a valid session", async () => {
    const { value } = await signSession(SECRET);
    expect(await verifySession(value, SECRET)).toBe(true);
  });

  it("rejects a session signed with a different secret", async () => {
    const { value } = await signSession(SECRET);
    expect(await verifySession(value, "other-secret")).toBe(false);
  });

  it("rejects a tampered payload", async () => {
    const { value } = await signSession(SECRET);
    const [, sig] = value.split(".");
    // Build a payload with a different exp while keeping the original sig.
    const fakePayload = btoa(JSON.stringify({ exp: 9999999999 }))
      .replace(/\+/g, "-")
      .replace(/\//g, "_")
      .replace(/=+$/, "");
    expect(await verifySession(`${fakePayload}.${sig}`, SECRET)).toBe(false);
  });

  it("rejects an expired session", async () => {
    const { value } = await signSession(SECRET, -10);
    expect(await verifySession(value, SECRET)).toBe(false);
  });

  it("rejects malformed cookie values", async () => {
    expect(await verifySession(undefined, SECRET)).toBe(false);
    expect(await verifySession("", SECRET)).toBe(false);
    expect(await verifySession("no-dot-here", SECRET)).toBe(false);
    expect(await verifySession("...", SECRET)).toBe(false);
  });
});
