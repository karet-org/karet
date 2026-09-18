// Session key material derivation, and how credentials get revoked.
//
// The key no longer mixes in the admin password hash: with several accounts,
// rotating one password must not sign everyone else out. Per-user revocation
// rides in the `cv` claim instead, which `currentPrincipal()` checks against the
// store.

import { describe, expect, it } from "vitest";
import { getSessionKeyMaterial, signSession, verifySession } from "../session";
import { credentialVersion } from "../roles";

describe("getSessionKeyMaterial", () => {
  it("derives from the session secret and changes when it rotates", () => {
    const a = getSessionKeyMaterial({ KARET_SESSION_SECRET: "s1" });
    const b = getSessionKeyMaterial({ KARET_SESSION_SECRET: "s2" });
    expect(a).not.toBeNull();
    expect(a).not.toBe(b);
  });

  it("returns null when the secret is missing or blank (fail closed)", () => {
    expect(getSessionKeyMaterial({})).toBeNull();
    expect(getSessionKeyMaterial({ KARET_SESSION_SECRET: "" })).toBeNull();
  });

  it("no longer depends on the admin hash, so one rotation can't sign out everyone", () => {
    const withHash = getSessionKeyMaterial({
      KARET_SESSION_SECRET: "s",
      KARET_ADMIN_PASSWORD_HASH: "h1",
    });
    const withOther = getSessionKeyMaterial({
      KARET_SESSION_SECRET: "s",
      KARET_ADMIN_PASSWORD_HASH: "h2",
    });
    expect(withHash).toBe(withOther);
  });

  it("secret rotation still invalidates previously signed sessions", async () => {
    const oldKey = getSessionKeyMaterial({ KARET_SESSION_SECRET: "old" })!;
    const newKey = getSessionKeyMaterial({ KARET_SESSION_SECRET: "new" })!;
    const { value } = await signSession(oldKey, { sub: "a", role: "admin", cv: "x" });
    expect(await verifySession(value, oldKey)).not.toBeNull();
    expect(await verifySession(value, newKey)).toBeNull();
  });
});

describe("credentialVersion", () => {
  it("changes when the password changes", async () => {
    const before = await credentialVersion({ role: "editor", passwordHash: "h1" });
    const after = await credentialVersion({ role: "editor", passwordHash: "h2" });
    expect(before).not.toBe(after);
  });

  it("changes when the role changes, so a demotion takes effect at once", async () => {
    const editor = await credentialVersion({ role: "editor", passwordHash: "h" });
    const viewer = await credentialVersion({ role: "viewer", passwordHash: "h" });
    expect(editor).not.toBe(viewer);
  });

  it("is stable for the same credential", async () => {
    const user = { role: "admin" as const, passwordHash: "h" };
    expect(await credentialVersion(user)).toBe(await credentialVersion(user));
  });
});
