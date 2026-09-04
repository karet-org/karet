// Session key material derivation: rotating either the session secret or
// the admin password hash must invalidate outstanding sessions.

import { describe, expect, it } from "vitest";
import {
  getSessionKeyMaterial,
  signSession,
  verifySession,
} from "../session";

describe("getSessionKeyMaterial", () => {
  it("derives from both secrets and changes when either rotates", () => {
    const a = getSessionKeyMaterial({
      KARET_SESSION_SECRET: "s1",
      KARET_ADMIN_PASSWORD_HASH: "h1",
    });
    const b = getSessionKeyMaterial({
      KARET_SESSION_SECRET: "s1",
      KARET_ADMIN_PASSWORD_HASH: "h2",
    });
    const c = getSessionKeyMaterial({
      KARET_SESSION_SECRET: "s2",
      KARET_ADMIN_PASSWORD_HASH: "h1",
    });
    expect(a).not.toBeNull();
    expect(new Set([a, b, c]).size).toBe(3);
  });

  it("returns null when either input is missing or blank (fail closed)", () => {
    expect(getSessionKeyMaterial({})).toBeNull();
    expect(
      getSessionKeyMaterial({ KARET_SESSION_SECRET: "s" }),
    ).toBeNull();
    expect(
      getSessionKeyMaterial({
        KARET_SESSION_SECRET: "",
        KARET_ADMIN_PASSWORD_HASH: "h",
      }),
    ).toBeNull();
  });

  it("password rotation invalidates previously signed sessions", async () => {
    const oldKey = getSessionKeyMaterial({
      KARET_SESSION_SECRET: "secret",
      KARET_ADMIN_PASSWORD_HASH: "old-hash",
    })!;
    const newKey = getSessionKeyMaterial({
      KARET_SESSION_SECRET: "secret",
      KARET_ADMIN_PASSWORD_HASH: "new-hash",
    })!;
    const { value } = await signSession(oldKey);
    expect(await verifySession(value, oldKey)).toBe(true);
    expect(await verifySession(value, newKey)).toBe(false);
  });
});
