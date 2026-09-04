// Tests for the env-sourced admin credential.

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { getAdminPasswordHash, verifyAdminPassword } from "../users";
import { hashPassword } from "../password";

describe("env-based admin credential", () => {
  let prior: string | undefined;

  beforeEach(() => {
    prior = process.env.KARET_ADMIN_PASSWORD_HASH;
  });
  afterEach(() => {
    if (prior === undefined) delete process.env.KARET_ADMIN_PASSWORD_HASH;
    else process.env.KARET_ADMIN_PASSWORD_HASH = prior;
  });

  it("verifies the correct password against the env hash", async () => {
    process.env.KARET_ADMIN_PASSWORD_HASH = await hashPassword("hunter2hunter2");
    expect(await verifyAdminPassword("hunter2hunter2")).toBe(true);
    expect(await verifyAdminPassword("wrong-password")).toBe(false);
  });

  it("fails closed when the hash is unset or blank", async () => {
    delete process.env.KARET_ADMIN_PASSWORD_HASH;
    expect(await verifyAdminPassword("anything")).toBe(false);
    process.env.KARET_ADMIN_PASSWORD_HASH = "";
    expect(await verifyAdminPassword("anything")).toBe(false);
  });

  it("fails closed on a malformed hash", async () => {
    process.env.KARET_ADMIN_PASSWORD_HASH = "not-a-scrypt-hash";
    expect(await verifyAdminPassword("anything")).toBe(false);
  });

  it("getAdminPasswordHash treats blank as unset", () => {
    expect(getAdminPasswordHash({ KARET_ADMIN_PASSWORD_HASH: "" })).toBeNull();
    expect(getAdminPasswordHash({})).toBeNull();
    expect(getAdminPasswordHash({ KARET_ADMIN_PASSWORD_HASH: "x" })).toBe("x");
  });

  it("hash-password CLI output verifies with the app's verifyPassword", async () => {
    // Pins the KEEP IN SYNC contract between scripts/hash-password.mjs
    // and lib/auth/password.ts by running the real script.
    const { execFileSync } = await import("node:child_process");
    const output = execFileSync("node", ["scripts/hash-password.mjs"], {
      input: "cli-roundtrip-pw\n",
      encoding: "utf-8",
      cwd: process.cwd(),
      stdio: ["pipe", "pipe", "ignore"],
    });
    // First stdout line is the plain hash; second is the compose-escaped form.
    const [hash, composeLine] = output.trim().split("\n");
    expect(hash.startsWith("scrypt$131072$8$1$")).toBe(true);
    expect(composeLine).toBe(
      `KARET_ADMIN_PASSWORD_HASH=${hash.replaceAll("$", "$$$$")}`,
    );
    const { verifyPassword } = await import("../password");
    expect(await verifyPassword("cli-roundtrip-pw", hash)).toBe(true);
  }, 30_000);
});
