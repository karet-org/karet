// Accounts, in Postgres.
//
// Better-auth owns the tables and the login flow. This module is the Karet-side
// view of them: listing accounts, setting roles, and the one thing the library
// has no opinion about — the bootstrap admin.
//
// Env stays the root of trust. `KARET_ADMIN_PASSWORD_HASH` is re-asserted into
// the database at startup, so a wiped or edited `user` table cannot lock the
// operator out or demote them: restart, and the account is back with the
// password the environment says it has.

import { randomUUID } from "node:crypto";
import { query, queryOne } from "@/lib/db";
import { isRole, type Role } from "./roles";
import { syntheticEmail } from "./auth";

export { ROLES, isRole, roleAtLeast, type Role } from "./roles";

export interface User {
  id: string;
  username: string;
  role: Role;
  createdAt: string;
  disabledAt: string | null;
}

interface UserRow {
  id: string;
  username: string | null;
  role: string;
  createdAt: Date;
}

function toUser(row: UserRow): User | null {
  if (!row.username || !isRole(row.role)) return null;
  return {
    id: row.id,
    username: row.username,
    role: row.role,
    createdAt: row.createdAt.toISOString(),
    disabledAt: null,
  };
}

/** The admin password hash from env, or null when unset/blank. */
export function getAdminPasswordHash(
  env: Record<string, string | undefined> = process.env,
): string | null {
  const hash = env.KARET_ADMIN_PASSWORD_HASH;
  return hash && hash.length > 0 ? hash : null;
}

export function getAdminUsername(
  env: Record<string, string | undefined> = process.env,
): string {
  return env.KARET_ADMIN_USERNAME?.trim() || "admin";
}

export async function listUsers(): Promise<User[]> {
  const rows = await query<UserRow>(
    `SELECT id, username, role, "createdAt" FROM "user" ORDER BY username`,
  );
  return rows.flatMap((r) => {
    const u = toUser(r);
    return u ? [u] : [];
  });
}

export async function findUserByUsername(username: string): Promise<User | null> {
  const row = await queryOne<UserRow>(
    `SELECT id, username, role, "createdAt" FROM "user" WHERE lower(username) = lower($1)`,
    [username],
  );
  return row ? toUser(row) : null;
}

export async function findUserById(id: string): Promise<User | null> {
  const row = await queryOne<UserRow>(
    `SELECT id, username, role, "createdAt" FROM "user" WHERE id = $1`,
    [id],
  );
  return row ? toUser(row) : null;
}

/**
 * Set a role, and end that person's sessions.
 *
 * Deleting their session rows is the point of database sessions: a demotion
 * takes effect on the next request instead of whenever a cookie happens to
 * expire.
 */
export async function setRole(username: string, role: Role): Promise<User | null> {
  const user = await findUserByUsername(username);
  if (!user) return null;
  await query(`UPDATE "user" SET role = $2, "updatedAt" = now() WHERE id = $1`, [
    user.id,
    role,
  ]);
  await revokeSessions(user.id);
  return { ...user, role };
}

/** End every session for a user. Returns how many were ended. */
export async function revokeSessions(userId: string): Promise<number> {
  const rows = await query<{ id: string }>(
    `DELETE FROM session WHERE "userId" = $1 RETURNING id`,
    [userId],
  );
  return rows.length;
}

/**
 * Create or update the bootstrap admin from the environment.
 *
 * Runs at startup. Writes the credential rows directly rather than going through
 * better-auth's sign-up API because this must work before anyone can log in, and
 * because the hash is already hashed — handing a hash to a sign-up call would
 * hash it twice.
 */
export async function upsertBootstrapAdmin(): Promise<{ username: string; created: boolean } | null> {
  const passwordHash = getAdminPasswordHash();
  if (!passwordHash) return null;
  const name = getAdminUsername();

  const existing = await findUserByUsername(name);
  const id = existing?.id ?? randomUUID();

  if (!existing) {
    await query(
      `INSERT INTO "user" (id, name, email, "emailVerified", username, "displayUsername", role)
       VALUES ($1, $2, $3, true, $2, $2, 'admin')`,
      [id, name, syntheticEmail(name)],
    );
  } else if (existing.role !== "admin") {
    // The store cannot demote the operator.
    await query(`UPDATE "user" SET role = 'admin', "updatedAt" = now() WHERE id = $1`, [id]);
  }

  // Better-auth keeps credentials in `account` with providerId 'credential'.
  const account = await queryOne<{ id: string; password: string | null }>(
    `SELECT id, password FROM account WHERE "userId" = $1 AND "providerId" = 'credential'`,
    [id],
  );
  if (!account) {
    await query(
      `INSERT INTO account (id, "accountId", "providerId", "userId", password)
       VALUES ($1, $2, 'credential', $2, $3)`,
      [randomUUID(), id, passwordHash],
    );
  } else if (account.password !== passwordHash) {
    // The environment is authoritative: a changed hash takes effect on restart,
    // and ends sessions signed against the old one.
    await query(`UPDATE account SET password = $2, "updatedAt" = now() WHERE id = $1`, [
      account.id,
      passwordHash,
    ]);
    await revokeSessions(id);
  }

  return { username: name, created: !existing };
}
