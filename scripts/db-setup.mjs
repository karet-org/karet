#!/usr/bin/env node
// Bring the database up to date, then assert the bootstrap admin.
//
// Runs before the server starts, not inside it. Next compiles the
// instrumentation hook for the Edge runtime as well as Node, and Edge cannot
// bundle `pg` (it reads `fs` lazily for TLS material), so schema work lives in a
// plain script that the bundler never sees. That also makes it runnable by hand
// against any environment.
//
//   node scripts/db-setup.mjs
//
// Migrations are the `.sql` files in migrations/, applied in filename order,
// each in a transaction, recorded in `_migrations`. An advisory lock means
// several containers starting at once is safe: the others wait, then find
// nothing to do.

import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import pg from "pg";

const LOCK_ID = 4726501;
const MIGRATIONS_DIR = join(process.cwd(), "migrations");
const EMAIL_DOMAIN = "karet.local";

const url = process.env.DATABASE_URL;
if (!url) {
  console.error("[db-setup] DATABASE_URL is not set");
  process.exit(1);
}

const client = new pg.Client({ connectionString: url });

/** Wait for Postgres to accept connections; compose ordering is not a guarantee. */
async function connectWithRetry(attempts = 30) {
  for (let i = 1; i <= attempts; i++) {
    try {
      await client.connect();
      return;
    } catch (err) {
      if (i === attempts) throw err;
      if (i === 1) console.log("[db-setup] waiting for postgres…");
      await new Promise((r) => setTimeout(r, 1000));
    }
  }
}

async function migrate() {
  await client.query(`
    CREATE TABLE IF NOT EXISTS _migrations (
      name       text PRIMARY KEY,
      applied_at timestamptz NOT NULL DEFAULT now()
    )`);
  await client.query("SELECT pg_advisory_lock($1)", [LOCK_ID]);
  try {
    const { rows } = await client.query("SELECT name FROM _migrations");
    const done = new Set(rows.map((r) => r.name));
    const files = (await readdir(MIGRATIONS_DIR)).filter((f) => f.endsWith(".sql")).sort();

    let applied = 0;
    for (const name of files) {
      if (done.has(name)) continue;
      const sql = await readFile(join(MIGRATIONS_DIR, name), "utf8");
      console.log(`[db-setup] applying ${name}`);
      await client.query("BEGIN");
      try {
        await client.query(sql);
        await client.query("INSERT INTO _migrations (name) VALUES ($1)", [name]);
        await client.query("COMMIT");
      } catch (err) {
        await client.query("ROLLBACK");
        throw new Error(`migration ${name} failed: ${err.message}`);
      }
      applied += 1;
    }
    console.log(
      applied === 0
        ? `[db-setup] schema up to date (${done.size} migration(s))`
        : `[db-setup] applied ${applied} migration(s)`,
    );
  } finally {
    await client.query("SELECT pg_advisory_unlock($1)", [LOCK_ID]);
  }
}

/**
 * Create or correct the bootstrap admin from the environment.
 *
 * Env is the root of trust: a wiped or edited `user` table must not be able to
 * lock the operator out or demote them, so this re-asserts the account on every
 * start. The hash is stored as-is — it is already hashed, and hashing it again
 * would lock out the very account this protects.
 */
async function upsertBootstrapAdmin() {
  const passwordHash = process.env.KARET_ADMIN_PASSWORD_HASH;
  if (!passwordHash) {
    console.log("[db-setup] no KARET_ADMIN_PASSWORD_HASH; skipping bootstrap admin");
    return;
  }
  const username = (process.env.KARET_ADMIN_USERNAME || "admin").trim();

  const { rows } = await client.query(
    `SELECT id, role FROM "user" WHERE lower(username) = lower($1)`,
    [username],
  );
  let id = rows[0]?.id;

  if (!id) {
    id = randomUUID();
    await client.query(
      `INSERT INTO "user" (id, name, email, "emailVerified", username, "displayUsername", role)
       VALUES ($1, $2, $3, true, $2, $2, 'admin')`,
      [id, username, `${username.toLowerCase()}@${EMAIL_DOMAIN}`],
    );
    console.log(`[db-setup] created bootstrap admin "${username}"`);
  } else if (rows[0].role !== "admin") {
    await client.query(`UPDATE "user" SET role = 'admin', "updatedAt" = now() WHERE id = $1`, [id]);
    console.log(`[db-setup] restored admin role for "${username}"`);
  }

  const account = await client.query(
    `SELECT id, password FROM account WHERE "userId" = $1 AND "providerId" = 'credential'`,
    [id],
  );
  if (account.rowCount === 0) {
    await client.query(
      `INSERT INTO account (id, "accountId", "providerId", "userId", password)
       VALUES ($1, $2, 'credential', $2, $3)`,
      [randomUUID(), id, passwordHash],
    );
  } else if (account.rows[0].password !== passwordHash) {
    await client.query(`UPDATE account SET password = $2, "updatedAt" = now() WHERE id = $1`, [
      account.rows[0].id,
      passwordHash,
    ]);
    // Sessions signed against the old credential end here.
    const revoked = await client.query(`DELETE FROM session WHERE "userId" = $1`, [id]);
    console.log(
      `[db-setup] updated admin credential from env; ended ${revoked.rowCount} session(s)`,
    );
  }
}

try {
  await connectWithRetry();
  await migrate();
  await upsertBootstrapAdmin();
} catch (err) {
  console.error(`[db-setup] ${err.message}`);
  process.exit(1);
} finally {
  await client.end().catch(() => {});
}
