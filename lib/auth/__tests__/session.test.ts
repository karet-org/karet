import { describe, it, expect } from "vitest";
import { signSession, verifySession } from "../session";

const SECRET = "test-secret-do-not-use-in-prod";

describe("session", () => {
  it("round-trips a valid session", async () => {
    const { value } = await signSession("alice", SECRET);
    const session = await verifySession(value, SECRET);
    expect(session?.username).toBe("alice");
  });

  it("rejects a session signed with a different secret", async () => {
    const { value } = await signSession("alice", SECRET);
    const session = await verifySession(value, "other-secret");
    expect(session).toBeNull();
  });

  it("rejects a tampered payload", async () => {
    const { value } = await signSession("alice", SECRET);
    const [, sig] = value.split(".");
    // Build a payload claiming to be admin while keeping the original sig.
    const fakePayload = btoa(JSON.stringify({ u: "admin", exp: 9999999999 }))
      .replace(/\+/g, "-")
      .replace(/\//g, "_")
      .replace(/=+$/, "");
    const session = await verifySession(`${fakePayload}.${sig}`, SECRET);
    expect(session).toBeNull();
  });

  it("rejects an expired session", async () => {
    const { value } = await signSession("alice", SECRET, -10);
    const session = await verifySession(value, SECRET);
    expect(session).toBeNull();
  });

  it("rejects malformed cookie values", async () => {
    expect(await verifySession(undefined, SECRET)).toBeNull();
    expect(await verifySession("", SECRET)).toBeNull();
    expect(await verifySession("no-dot-here", SECRET)).toBeNull();
    expect(await verifySession("...", SECRET)).toBeNull();
  });
});
