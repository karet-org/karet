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
import { query, queryOne, transaction } from "@/lib/db";
import { isRole, type Role } from "./roles";
import { syntheticEmail } from "./auth";

export { ROLES, isRole, roleAtLeast, type Role } from "./roles";

export interface User {
  id: string;
  username: string;
  /** What this person calls themselves. Defaults to the username. */
  displayName: string;
  role: Role;
  createdAt: string;
}

interface UserRow {
  id: string;
  username: string | null;
  name: string | null;
  role: string;
  createdAt: Date;
}

function toUser(row: UserRow): User | null {
  if (!row.username || !isRole(row.role)) return null;
  return {
    id: row.id,
    username: row.username,
    displayName: row.name?.trim() || row.username,
    role: row.role,
    createdAt: row.createdAt.toISOString(),
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
    `SELECT id, username, name, role, "createdAt" FROM "user" ORDER BY username`,
  );
  return rows.flatMap((r) => {
    const u = toUser(r);
    return u ? [u] : [];
  });
}

export async function findUserByUsername(username: string): Promise<User | null> {
  const row = await queryOne<UserRow>(
    `SELECT id, username, name, role, "createdAt" FROM "user" WHERE lower(username) = lower($1)`,
    [username],
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
 * Create an account with a credential, in one transaction.
 *
 * Written directly rather than through better-auth's sign-up API, which would hash
 * an already-hashed password and sign the admin in as the account they just made.
 */
export async function createUser(
  username: string,
  role: Role,
  passwordHash: string,
): Promise<User> {
  const id = randomUUID();
  const row = await transaction(async (client) => {
    const inserted = await client.query<UserRow>(
      `INSERT INTO "user" (id, name, email, "emailVerified", username, "displayUsername", role)
       VALUES ($1, $2, $3, true, $2, $2, $4)
       RETURNING id, username, name, role, "createdAt"`,
      [id, username, syntheticEmail(username), role],
    );
    await client.query(
      `INSERT INTO account (id, "accountId", "providerId", "userId", password)
       VALUES ($1, $2, 'credential', $2, $3)`,
      [randomUUID(), id, passwordHash],
    );
    return inserted.rows[0];
  });
  const user = toUser(row);
  if (!user) throw new Error("created a user the store cannot read back");
  return user;
}

/**
 * Sessions, credentials and per-pipeline grants cascade. Pipelines they own do not:
 * `owner_id` becomes null, so an admin can hand them on.
 */
export async function deleteUser(userId: string): Promise<void> {
  await query(`DELETE FROM "user" WHERE id = $1`, [userId]);
}

/** Pipelines that would lose their owner if this account went. */
export async function pipelinesOwnedBy(userId: string): Promise<string[]> {
  const rows = await query<{ name: string }>(
    `SELECT name FROM pipelines WHERE owner_id = $1 ORDER BY name`,
    [userId],
  );
  return rows.map((r) => r.name);
}

/** The stored credential hash, for verifying a password somebody already knows. */
export async function credentialHash(userId: string): Promise<string | null> {
  const row = await queryOne<{ password: string | null }>(
    `SELECT password FROM account WHERE "userId" = $1 AND "providerId" = 'credential'`,
    [userId],
  );
  return row?.password ?? null;
}

/** Set what this person is called. Blank falls back to their username on read. */
export async function setDisplayName(userId: string, name: string): Promise<void> {
  await query(`UPDATE "user" SET name = $2, "updatedAt" = now() WHERE id = $1`, [userId, name]);
}

/**
 * Replace an account's password and sign it out everywhere. Ending the sessions is
 * the point: a live session would outlive the password it was opened with.
 */
export async function setPassword(userId: string, passwordHash: string): Promise<void> {
  await query(
    `UPDATE account SET password = $2, "updatedAt" = now()
      WHERE "userId" = $1 AND "providerId" = 'credential'`,
    [userId, passwordHash],
  );
  await revokeSessions(userId);
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
