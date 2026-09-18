// Tests for accounts: the env bootstrap admin, the S3-backed team store, and
// credential verification.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  getAdminPasswordHash,
  getBootstrapAdmin,
  isRole,
  listUsers,
  verifyCredentials,
} from "../users";
import { hashPassword } from "../password";

// The team store lives in S3; stub the read so these stay unit-level.
let storedUsers: { username: string; role: string; password_hash: string }[] = [];
vi.mock("@aws-sdk/client-s3", () => ({
  S3Client: class {
    async send() {
      return {
        Body: {
          transformToString: async () => JSON.stringify({ version: 1, users: storedUsers }),
        },
      };
    }
  },
  GetObjectCommand: class {},
}));
vi.mock("@/lib/services/s3-helpers", () => ({
  readBodyToBuffer: async (body: { transformToString: () => Promise<string> }) =>
    Buffer.from(await body.transformToString()),
}));
vi.mock("@/lib/config/s3-client", () => ({
  loadS3Config: () => ({ pipelinesBucket: "karet-pipelines" }),
  createS3Client: () => new (class { async send() {
    return {
      Body: {
        transformToString: async () => JSON.stringify({ version: 1, users: storedUsers }),
      },
    };
  } })(),
}));

describe("accounts", () => {
  let prior: string | undefined;
  let priorName: string | undefined;

  beforeEach(() => {
    prior = process.env.KARET_ADMIN_PASSWORD_HASH;
    priorName = process.env.KARET_ADMIN_USERNAME;
    storedUsers = [];
  });
  afterEach(() => {
    if (prior === undefined) delete process.env.KARET_ADMIN_PASSWORD_HASH;
    else process.env.KARET_ADMIN_PASSWORD_HASH = prior;
    if (priorName === undefined) delete process.env.KARET_ADMIN_USERNAME;
    else process.env.KARET_ADMIN_USERNAME = priorName;
  });

  it("verifies the bootstrap admin from env", async () => {
    process.env.KARET_ADMIN_PASSWORD_HASH = await hashPassword("hunter2hunter2");
    expect(await verifyCredentials("admin", "hunter2hunter2")).toMatchObject({
      username: "admin",
      role: "admin",
    });
    expect(await verifyCredentials("admin", "wrong-password")).toBeNull();
  });

  it("names the bootstrap admin from KARET_ADMIN_USERNAME", async () => {
    process.env.KARET_ADMIN_PASSWORD_HASH = await hashPassword("hunter2hunter2");
    process.env.KARET_ADMIN_USERNAME = "joey";
    expect(getBootstrapAdmin()?.username).toBe("joey");
    expect(await verifyCredentials("admin", "hunter2hunter2")).toBeNull();
    expect(await verifyCredentials("joey", "hunter2hunter2")).not.toBeNull();
  });

  it("verifies a stored team account", async () => {
    delete process.env.KARET_ADMIN_PASSWORD_HASH;
    storedUsers = [
      { username: "bob", role: "viewer", password_hash: await hashPassword("bobs-password") },
    ];
    expect(await verifyCredentials("bob", "bobs-password")).toMatchObject({
      username: "bob",
      role: "viewer",
    });
    expect(await verifyCredentials("bob", "nope")).toBeNull();
  });

  it("fails closed when nothing is configured", async () => {
    delete process.env.KARET_ADMIN_PASSWORD_HASH;
    storedUsers = [];
    expect(await verifyCredentials("admin", "anything")).toBeNull();
  });

  it("fails closed on a malformed hash", async () => {
    process.env.KARET_ADMIN_PASSWORD_HASH = "not-a-scrypt-hash";
    expect(await verifyCredentials("admin", "anything")).toBeNull();
  });

  it("ignores store entries with an unknown role rather than trusting them", async () => {
    delete process.env.KARET_ADMIN_PASSWORD_HASH;
    storedUsers = [{ username: "eve", role: "superuser", password_hash: await hashPassword("x") }];
    expect(await listUsers()).toEqual([]);
    expect(await verifyCredentials("eve", "x")).toBeNull();
  });

  it("lets the bootstrap admin shadow a stored account of the same name", async () => {
    process.env.KARET_ADMIN_PASSWORD_HASH = await hashPassword("env-password");
    storedUsers = [
      { username: "admin", role: "viewer", password_hash: await hashPassword("store-password") },
    ];
    const users = await listUsers();
    expect(users).toHaveLength(1);
    expect(users[0].role).toBe("admin");
    // The store cannot demote the operator or replace their password.
    expect(await verifyCredentials("admin", "store-password")).toBeNull();
    expect(await verifyCredentials("admin", "env-password")).toMatchObject({ role: "admin" });
  });

  it("getAdminPasswordHash treats blank as unset", () => {
    expect(getAdminPasswordHash({ KARET_ADMIN_PASSWORD_HASH: "" })).toBeNull();
    expect(getAdminPasswordHash({})).toBeNull();
    expect(getAdminPasswordHash({ KARET_ADMIN_PASSWORD_HASH: "x" })).toBe("x");
  });

  it("isRole accepts exactly the three roles", () => {
    expect(["viewer", "editor", "admin"].every(isRole)).toBe(true);
    expect(isRole("owner")).toBe(false);
    expect(isRole(undefined)).toBe(false);
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
