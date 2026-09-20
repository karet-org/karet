// Accounts, now that better-auth owns identity and Postgres owns the rows.
//
// Credential verification itself is the library's, and its own suite covers it;
// what is Karet's and therefore tested here is the env-rooted bootstrap admin,
// the role helpers, and that changing a role ends that person's sessions.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// The store is a database now, so the query layer is what gets stubbed. Each
// test declares the rows it expects to be asked for.
const calls: { sql: string; values: unknown[] }[] = [];
let rows: Record<string, unknown[]> = {};

function matchFixture(sql: string): unknown[] {
  for (const [fragment, result] of Object.entries(rows)) {
    if (sql.includes(fragment)) return result;
  }
  return [];
}

vi.mock("@/lib/db", () => ({
  databaseUrl: () => "postgres://stub",
  query: async (sql: string, values: unknown[] = []) => {
    calls.push({ sql, values });
    return matchFixture(sql);
  },
  queryOne: async (sql: string, values: unknown[] = []) => {
    calls.push({ sql, values });
    return matchFixture(sql)[0] ?? null;
  },
  transaction: async (fn: (client: unknown) => Promise<unknown>) =>
    fn({
      query: async (sql: string, values: unknown[] = []) => {
        calls.push({ sql, values });
        return { rows: matchFixture(sql) };
      },
    }),
}));

// The auth instance opens a pool at import time; only the helper is needed here.
vi.mock("@/lib/auth/auth", () => ({
  syntheticEmail: (u: string) => `${u.toLowerCase()}@karet.local`,
}));

const {
  getAdminPasswordHash,
  getAdminUsername,
  createUser,
  deleteUser,
  findUserByUsername,
  listUsers,
  setRole,
  upsertBootstrapAdmin,
  isRole,
} = await import("../users");
const { USERNAME_PATTERN } = await import("../account-rules");

const USER_ROW = {
  id: "u1",
  username: "erin",
  role: "editor",
  createdAt: new Date("2026-09-17T00:00:00Z"),
};

describe("bootstrap admin", () => {
  let priorHash: string | undefined;
  let priorName: string | undefined;

  beforeEach(() => {
    priorHash = process.env.KARET_ADMIN_PASSWORD_HASH;
    priorName = process.env.KARET_ADMIN_USERNAME;
    calls.length = 0;
    rows = {};
  });
  afterEach(() => {
    if (priorHash === undefined) delete process.env.KARET_ADMIN_PASSWORD_HASH;
    else process.env.KARET_ADMIN_PASSWORD_HASH = priorHash;
    if (priorName === undefined) delete process.env.KARET_ADMIN_USERNAME;
    else process.env.KARET_ADMIN_USERNAME = priorName;
  });

  it("does nothing when no hash is configured", async () => {
    delete process.env.KARET_ADMIN_PASSWORD_HASH;
    expect(await upsertBootstrapAdmin()).toBeNull();
    expect(calls).toHaveLength(0);
  });

  it("creates the account and its credential when absent", async () => {
    process.env.KARET_ADMIN_PASSWORD_HASH = "scrypt$1$2$3$salt$hash";
    const result = await upsertBootstrapAdmin();
    expect(result).toEqual({ username: "admin", created: true });
    const inserts = calls.filter((c) => c.sql.includes("INSERT INTO"));
    expect(inserts.some((c) => c.sql.includes('INSERT INTO "user"'))).toBe(true);
    expect(inserts.some((c) => c.sql.includes("INSERT INTO account"))).toBe(true);
    // The hash from env is stored as-is; hashing it again would lock the operator out.
    expect(inserts.some((c) => c.values.includes("scrypt$1$2$3$salt$hash"))).toBe(true);
  });

  it("takes its username from KARET_ADMIN_USERNAME", async () => {
    process.env.KARET_ADMIN_PASSWORD_HASH = "scrypt$1$2$3$salt$hash";
    process.env.KARET_ADMIN_USERNAME = "joey";
    expect(getAdminUsername()).toBe("joey");
    expect((await upsertBootstrapAdmin())?.username).toBe("joey");
  });

  it("re-promotes the admin when the row was demoted, so the table can't lock them out", async () => {
    process.env.KARET_ADMIN_PASSWORD_HASH = "scrypt$1$2$3$salt$hash";
    rows = {
      'FROM "user" WHERE lower(username)': [{ ...USER_ROW, username: "admin", role: "viewer" }],
      "FROM account": [{ id: "a1", password: "scrypt$1$2$3$salt$hash" }],
    };
    await upsertBootstrapAdmin();
    expect(
      calls.some((c) => c.sql.includes("SET role = 'admin'")),
      "expected the role to be restored",
    ).toBe(true);
  });

  it("rewrites a stale credential and ends sessions signed against it", async () => {
    process.env.KARET_ADMIN_PASSWORD_HASH = "scrypt$new";
    rows = {
      'FROM "user" WHERE lower(username)': [{ ...USER_ROW, username: "admin", role: "admin" }],
      "FROM account": [{ id: "a1", password: "scrypt$old" }],
    };
    await upsertBootstrapAdmin();
    expect(calls.some((c) => c.sql.includes("UPDATE account SET password"))).toBe(true);
    expect(calls.some((c) => c.sql.includes("DELETE FROM session"))).toBe(true);
  });

  it("getAdminPasswordHash treats blank as unset", () => {
    expect(getAdminPasswordHash({ KARET_ADMIN_PASSWORD_HASH: "" })).toBeNull();
    expect(getAdminPasswordHash({})).toBeNull();
    expect(getAdminPasswordHash({ KARET_ADMIN_PASSWORD_HASH: "x" })).toBe("x");
  });
});

describe("reading accounts", () => {
  beforeEach(() => {
    calls.length = 0;
    rows = {};
  });

  it("maps a row to a user", async () => {
    rows = { 'FROM "user" WHERE lower(username)': [USER_ROW] };
    expect(await findUserByUsername("erin")).toMatchObject({
      id: "u1",
      username: "erin",
      role: "editor",
    });
  });

  it("is case-insensitive on username", async () => {
    rows = { 'FROM "user" WHERE lower(username)': [USER_ROW] };
    await findUserByUsername("ERIN");
    expect(calls[0].sql).toContain("lower(username) = lower($1)");
  });

  it("drops a row whose role is not one of the three rather than trusting it", async () => {
    rows = { 'FROM "user" ORDER BY': [{ ...USER_ROW, role: "superuser" }] };
    expect(await listUsers()).toEqual([]);
  });

  it("drops a row with no username, which cannot sign in", async () => {
    rows = { 'FROM "user" ORDER BY': [{ ...USER_ROW, username: null }] };
    expect(await listUsers()).toEqual([]);
  });
});

describe("setRole", () => {
  beforeEach(() => {
    calls.length = 0;
    rows = { 'FROM "user" WHERE lower(username)': [USER_ROW] };
  });

  it("updates the role and ends that user's sessions", async () => {
    const updated = await setRole("erin", "admin");
    expect(updated?.role).toBe("admin");
    expect(calls.some((c) => c.sql.includes('UPDATE "user" SET role'))).toBe(true);
    const revoke = calls.find((c) => c.sql.includes("DELETE FROM session"));
    expect(revoke, "a demotion must not wait for a cookie to expire").toBeTruthy();
    expect(revoke?.values).toEqual(["u1"]);
  });

  it("returns null for an unknown user", async () => {
    rows = {};
    expect(await setRole("nobody", "admin")).toBeNull();
  });
});

describe("isRole", () => {
  it("accepts exactly the three roles", () => {
    expect(["viewer", "editor", "admin"].every(isRole)).toBe(true);
    expect(isRole("owner")).toBe(false);
  });
});

describe("creating an account", () => {
  beforeEach(() => {
    calls.length = 0;
    rows = { 'INSERT INTO "user"': [{ ...USER_ROW, username: "pat", role: "viewer" }] };
  });

  it("writes the account and its credential in one transaction", async () => {
    const user = await createUser("pat", "viewer", "scrypt$hash");
    expect(user.username).toBe("pat");
    const sql = calls.map((c) => c.sql).join("\n");
    expect(sql).toContain('INSERT INTO "user"');
    expect(sql).toContain("INSERT INTO account");
    // The hash goes in as given: hashing an already-hashed password locks the
    // account out, which is why sign-up is not used here.
    expect(calls.some((c) => c.values.includes("scrypt$hash"))).toBe(true);
  });

  it("gives the account a synthetic email, since nothing sends mail", async () => {
    await createUser("pat", "viewer", "scrypt$hash");
    expect(calls[0].values).toContain("pat@karet.local");
  });
});

describe("deleting an account", () => {
  it("deletes the row and lets the schema cascade the rest", async () => {
    calls.length = 0;
    await deleteUser("u1");
    expect(calls).toHaveLength(1);
    expect(calls[0].sql).toContain('DELETE FROM "user"');
    expect(calls[0].values).toEqual(["u1"]);
  });
});

describe("USERNAME_PATTERN", () => {
  it("accepts what better-auth's username plugin accepts", () => {
    expect(USERNAME_PATTERN.test("pat")).toBe(true);
    expect(USERNAME_PATTERN.test("pat.smith_2")).toBe(true);
    expect(USERNAME_PATTERN.test("ab")).toBe(false);
    // A hyphen is rejected by the plugin, so rejecting it here turns a confusing
    // sign-in failure into a message at the point of typing.
    expect(USERNAME_PATTERN.test("pat-smith")).toBe(false);
    expect(USERNAME_PATTERN.test("a".repeat(33))).toBe(false);
  });
});
