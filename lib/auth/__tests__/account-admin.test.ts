// Administering accounts: the rules, tested through the interface that holds them.
//
// These four refusals existed only as `NextResponse` constructions inside route
// handlers, so nothing checked them without an HTTP request and `users.ts` would
// demote the bootstrap admin if called directly. The store is stubbed; what is
// under test is who may do what to whom.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const store = {
  users: [] as { id: string; username: string; role: string }[],
  roleSet: [] as { username: string; role: string }[],
  deleted: [] as string[],
  passwords: [] as { userId: string; hash: string }[],
  created: [] as { username: string; role: string }[],
  names: [] as { userId: string; name: string }[],
};

vi.mock("@/lib/auth/users", () => ({
  getAdminUsername: () => process.env.KARET_ADMIN_USERNAME || "admin",
  listUsers: async () =>
    store.users.map((u) => ({ ...u, createdAt: "2026-09-01T00:00:00.000Z" })),
  findUserByUsername: async (name: string) =>
    store.users.find((u) => u.username.toLowerCase() === name.toLowerCase()) ?? null,
  setRole: async (username: string, role: string) => {
    store.roleSet.push({ username, role });
    return { id: "u", username, role, createdAt: "" };
  },
  setPassword: async (userId: string, hash: string) => {
    store.passwords.push({ userId, hash });
  },
  deleteUser: async (id: string) => {
    store.deleted.push(id);
  },
  createUser: async (username: string, role: string) => {
    store.created.push({ username, role });
    return { id: "new", username, role, createdAt: "2026-09-20T00:00:00.000Z" };
  },
  pipelinesOwnedBy: async () => ["Homelab Traffic"],
  credentialHash: async (userId: string) => (userId === "u-vic" ? "stored-hash" : null),
  setDisplayName: async (userId: string, name: string) => {
    store.names.push({ userId, name });
  },
}));

// scrypt at OWASP cost takes ~0.5s per call; the hash is not what these assert.
vi.mock("@/lib/auth/password", () => ({
  hashPassword: async () => "scrypt$stub",
  // The stored hash in the stub is "stored-hash"; only "right" matches it.
  verifyPassword: async (password: string, stored: string) =>
    stored === "stored-hash" && password === "right",
}));

const admin = { username: "admin", role: "admin" as const, service: false };
const erin = { username: "erin", role: "admin" as const, service: false };
const machine = { username: "service", role: "admin" as const, service: true };

const {
  changeOwnDisplayName,
  changeOwnPassword,
  changeRole,
  createAccount,
  deletionCost,
  isBootstrap,
  removeAccount,
  resetPassword,
} = await import("../account-admin");

describe("administering accounts", () => {
  let priorName: string | undefined;

  beforeEach(() => {
    priorName = process.env.KARET_ADMIN_USERNAME;
    process.env.KARET_ADMIN_USERNAME = "admin";
    store.users = [
      { id: "u-admin", username: "admin", role: "admin" },
      { id: "u-erin", username: "erin", role: "admin" },
      { id: "u-vic", username: "vic", role: "viewer" },
    ];
    store.roleSet = [];
    store.deleted = [];
    store.passwords = [];
    store.created = [];
    store.names = [];
  });

  afterEach(() => {
    if (priorName === undefined) delete process.env.KARET_ADMIN_USERNAME;
    else process.env.KARET_ADMIN_USERNAME = priorName;
  });

  describe("the bootstrap admin", () => {
    it("cannot be demoted, because the environment restores it on restart", async () => {
      const out = await changeRole(erin, "admin", "viewer");
      expect(out).toMatchObject({ ok: false, error: "bootstrap_admin", status: 422 });
      expect(store.roleSet).toEqual([]);
    });

    it("cannot be deleted", async () => {
      expect(await removeAccount(erin, "admin")).toMatchObject({ error: "bootstrap_admin" });
      expect(store.deleted).toEqual([]);
    });

    it("cannot have its password reset here, since env sets that too", async () => {
      expect(await resetPassword("admin", "long-enough-password")).toMatchObject({
        error: "bootstrap_admin",
      });
      expect(store.passwords).toEqual([]);
    });

    it("is recognised case-insensitively and follows KARET_ADMIN_USERNAME", async () => {
      expect(isBootstrap("ADMIN")).toBe(true);
      process.env.KARET_ADMIN_USERNAME = "operator";
      expect(isBootstrap("admin")).toBe(false);
      expect(isBootstrap("Operator")).toBe(true);
    });
  });

  describe("your own account", () => {
    it("cannot have its role changed, since demoting yourself removes the page you are on", async () => {
      const out = await changeRole(erin, "erin", "viewer");
      expect(out).toMatchObject({ ok: false, error: "self_role_change", status: 422 });
      expect(store.roleSet).toEqual([]);
    });

    it("cannot be deleted, since that ends the session making the request", async () => {
      expect(await removeAccount(erin, "erin")).toMatchObject({ error: "self_delete" });
      expect(store.deleted).toEqual([]);
    });

    it("can have its password reset: it signs you out, which is what a reset means", async () => {
      const out = await resetPassword("erin", "long-enough-password");
      expect(out.ok).toBe(true);
      expect(store.passwords).toEqual([{ userId: "u-erin", hash: "scrypt$stub" }]);
    });

    it("is somebody else's when the caller is the service token", async () => {
      const out = await changeRole(machine, "erin", "viewer");
      expect(out.ok).toBe(true);
      expect(store.roleSet).toEqual([{ username: "erin", role: "viewer" }]);
    });
  });

  describe("somebody else's account", () => {
    it("changes role and reports the new one", async () => {
      const out = await changeRole(admin, "vic", "editor");
      expect(out).toMatchObject({ ok: true, value: { username: "vic", role: "editor" } });
    });

    it("deletes", async () => {
      expect((await removeAccount(admin, "vic")).ok).toBe(true);
      expect(store.deleted).toEqual(["u-vic"]);
    });

    it("refuses an unknown role without touching the store", async () => {
      expect(await changeRole(admin, "vic", "root")).toMatchObject({ error: "invalid_role" });
      expect(store.roleSet).toEqual([]);
    });

    it("404s for an account that does not exist", async () => {
      expect(await changeRole(admin, "nobody", "editor")).toMatchObject({
        error: "no_such_user",
        status: 404,
      });
      expect(await removeAccount(admin, "nobody")).toMatchObject({ status: 404 });
      expect(await resetPassword("nobody", "long-enough-password")).toMatchObject({ status: 404 });
      expect(await deletionCost("nobody")).toMatchObject({ status: 404 });
    });
  });

  describe("creating an account", () => {
    it("creates one at the role given", async () => {
      const out = await createAccount({ username: "pat", password: "long-enough", role: "editor" });
      expect(out.ok).toBe(true);
      expect(store.created).toEqual([{ username: "pat", role: "editor" }]);
    });

    it("refuses a taken name with 409, before hashing anything", async () => {
      expect(await createAccount({ username: "VIC", password: "long-enough", role: "viewer" })).toMatchObject({
        error: "already_exists",
        status: 409,
      });
      expect(store.created).toEqual([]);
    });

    it("refuses a bad username, a short password and an unknown role", async () => {
      expect(await createAccount({ username: "no-hyphens", password: "long-enough", role: "viewer" }))
        .toMatchObject({ error: "invalid_username" });
      expect(await createAccount({ username: "pat", password: "short", role: "viewer" }))
        .toMatchObject({ error: "weak_password" });
      expect(await createAccount({ username: "pat", password: "long-enough", role: "root" }))
        .toMatchObject({ error: "invalid_role" });
      expect(store.created).toEqual([]);
    });
  });

  describe("your own display name", () => {
    const vic = { username: "vic", role: "viewer" as const, service: false };

    it("is yours to set, whatever your role", async () => {
      const out = await changeOwnDisplayName(vic, "  Vic Fuentes  ");
      expect(out).toMatchObject({ ok: true, value: { displayName: "Vic Fuentes" } });
      expect(store.names).toEqual([{ userId: "u-vic", name: "Vic Fuentes" }]);
    });

    it("reads back as the username when cleared, so there is always something to show", async () => {
      const out = await changeOwnDisplayName(vic, "   ");
      expect(out).toMatchObject({ ok: true, value: { displayName: "vic" } });
      expect(store.names).toEqual([{ userId: "u-vic", name: "" }]);
    });

    it("refuses one over 64 characters, and anything that is not text", async () => {
      expect(await changeOwnDisplayName(vic, "x".repeat(65))).toMatchObject({
        error: "invalid_display_name",
      });
      expect(await changeOwnDisplayName(vic, 42)).toMatchObject({ error: "invalid_display_name" });
      expect(store.names).toEqual([]);
    });
  });

  describe("your own password", () => {
    const vic = { username: "vic", role: "viewer" as const, service: false };

    it("changes when the current one is right", async () => {
      const out = await changeOwnPassword(vic, "right", "long-enough-password");
      expect(out).toMatchObject({ ok: true, value: { username: "vic" } });
      expect(store.passwords).toEqual([{ userId: "u-vic", hash: "scrypt$stub" }]);
    });

    it("refuses a wrong current password with 403 and writes nothing", async () => {
      const out = await changeOwnPassword(vic, "wrong", "long-enough-password");
      expect(out).toMatchObject({ ok: false, error: "wrong_password", status: 403 });
      expect(store.passwords).toEqual([]);
    });

    it("refuses a short new password before checking the current one", async () => {
      expect(await changeOwnPassword(vic, "right", "short")).toMatchObject({
        error: "weak_password",
      });
      expect(store.passwords).toEqual([]);
    });

    it("refuses the bootstrap admin, whose password the environment restores", async () => {
      expect(await changeOwnPassword(admin, "right", "long-enough-password")).toMatchObject({
        error: "bootstrap_admin",
      });
      expect(store.passwords).toEqual([]);
    });

    it("refuses the service token, which has no password", async () => {
      expect(await changeOwnPassword(machine, "right", "long-enough-password")).toMatchObject({
        error: "service_principal",
        status: 403,
      });
    });
  });

  it("reports what a deletion would cost, so the confirmation can name it", async () => {
    expect(await deletionCost("vic")).toMatchObject({
      ok: true,
      value: { ownedPipelines: ["Homelab Traffic"] },
    });
  });
});
