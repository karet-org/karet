import { describe, it, expect } from "vitest";
import { signSession, verifySession } from "../session";

const SECRET = "test-secret-do-not-use-in-prod";
const CLAIMS = { sub: "alice", role: "editor" as const, cv: "abc123" };

describe("session", () => {
  it("round-trips claims", async () => {
    const { value } = await signSession(SECRET, CLAIMS);
    const claims = await verifySession(value, SECRET);
    expect(claims).toMatchObject(CLAIMS);
    expect(typeof claims?.exp).toBe("number");
  });

  it("rejects a session signed with a different secret", async () => {
    const { value } = await signSession(SECRET, CLAIMS);
    expect(await verifySession(value, "other-secret")).toBeNull();
  });

  it("rejects a tampered payload", async () => {
    const { value } = await signSession(SECRET, CLAIMS);
    const [, sig] = value.split(".");
    // Privilege escalation attempt: same signature, role rewritten to admin.
    const fakePayload = btoa(
      JSON.stringify({ sub: "alice", role: "admin", cv: "abc123", exp: 9999999999 }),
    )
      .replace(/\+/g, "-")
      .replace(/\//g, "_")
      .replace(/=+$/, "");
    expect(await verifySession(`${fakePayload}.${sig}`, SECRET)).toBeNull();
  });

  it("rejects an expired session", async () => {
    const { value } = await signSession(SECRET, CLAIMS, -10);
    expect(await verifySession(value, SECRET)).toBeNull();
  });

  it("rejects claims missing a subject or carrying an unknown role", async () => {
    for (const bad of [
      { sub: "", role: "editor", cv: "x" },
      { sub: "alice", role: "superuser", cv: "x" },
      { sub: "alice", role: "editor" },
    ]) {
      // Sign whatever shape, then confirm verification refuses it.
      const { value } = await signSession(SECRET, bad as never);
      expect(await verifySession(value, SECRET)).toBeNull();
    }
  });

  it("rejects malformed cookie values", async () => {
    expect(await verifySession(undefined, SECRET)).toBeNull();
    expect(await verifySession("", SECRET)).toBeNull();
    expect(await verifySession("no-dot-here", SECRET)).toBeNull();
    expect(await verifySession("...", SECRET)).toBeNull();
  });
});
