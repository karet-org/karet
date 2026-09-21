#!/usr/bin/env node
// Manage accounts in Postgres.
//
//   node scripts/manage-users.mjs list
//   node scripts/manage-users.mjs add <username> <viewer|editor|admin>
//   node scripts/manage-users.mjs set-role <username> <role>
//   node scripts/manage-users.mjs set-password <username>
//   node scripts/manage-users.mjs remove <username>
//   node scripts/manage-users.mjs import-s3   # one-off, from _auth/users.json
//
// `add` and `set-password` read the password from stdin so it stays out of shell
// history. The bootstrap admin lives in KARET_ADMIN_PASSWORD_HASH and is
// re-asserted on startup, so it is not managed here.
//
// Rows are written directly rather than through better-auth's API because this
// runs as an operator tool with no HTTP server to talk to. KEEP IN SYNC with
// migrations/0001_auth.sql and lib/auth/password.ts.

import { randomBytes, randomUUID, scrypt as scryptCb } from "node:crypto";
import { createInterface } from "node:readline";
import pg from "pg";

const ROLES = ["viewer", "editor", "admin"];
const EMAIL_DOMAIN = "karet.local";

// Same cost parameters as lib/auth/password.ts.
const KEY_LEN = 64;
const SALT_LEN = 16;
const N = 131072;
const R = 8;
const P = 1;

const url = process.env.DATABASE_URL;
if (!url) {
  console.error("DATABASE_URL is not set.");
  process.exit(1);
}
const client = new pg.Client({ connectionString: url });

function hashPassword(password) {
  const salt = randomBytes(SALT_LEN);
  return new Promise((resolve, reject) => {
    scryptCb(password, salt, KEY_LEN, { N, r: R, p: P, maxmem: 256 * N * R * P }, (err, dk) =>
      err
        ? reject(err)
        : resolve(["scrypt", N, R, P, salt.toString("base64"), dk.toString("base64")].join("$")),
    );
  });
}

function ask(prompt) {
  const rl = createInterface({ input: process.stdin, output: process.stderr });
  return new Promise((resolve) => rl.question(prompt, (a) => { rl.close(); resolve(a); }));
}

async function newPassword() {
  const password = (await ask("Password: ")).trim();
  if (password.length < 8) {
    console.error("Password must be at least 8 characters.");
    process.exit(1);
  }
  return hashPassword(password);
}

function requireRole(role) {
  if (!ROLES.includes(role)) {
    console.error(`Role must be one of: ${ROLES.join(", ")}`);
    process.exit(1);
  }
  return role;
}

async function findUser(username) {
  const { rows } = await client.query(
    `SELECT id, username, role FROM "user" WHERE lower(username) = lower($1)`,
    [username],
  );
  return rows[0] ?? null;
}

/** Ending a user's sessions is what makes a role or password change immediate. */
async function revokeSessions(userId) {
  const { rowCount } = await client.query(`DELETE FROM session WHERE "userId" = $1`, [userId]);
  return rowCount;
}

async function createUser(username, role, passwordHash) {
  const id = randomUUID();
  await client.query("BEGIN");
  try {
    await client.query(
      `INSERT INTO "user" (id, name, email, "emailVerified", username, "displayUsername", role)
       VALUES ($1, $2, $3, true, $2, $2, $4)`,
      [id, username, `${username.toLowerCase()}@${EMAIL_DOMAIN}`, role],
    );
    await client.query(
      `INSERT INTO account (id, "accountId", "providerId", "userId", password)
       VALUES ($1, $2, 'credential', $2, $3)`,
      [randomUUID(), id, passwordHash],
    );
    await client.query("COMMIT");
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  }
  return id;
}

/** One-off: bring accounts over from the pre-Postgres `_auth/users.json`. */
async function importFromS3() {
  const { GetObjectCommand, S3Client } = await import("@aws-sdk/client-s3");
  const s3 = new S3Client({
    region: process.env.AWS_REGION || "us-east-1",
    endpoint: process.env.AWS_ENDPOINT_URL || undefined,
    forcePathStyle: process.env.S3_FORCE_PATH_STYLE !== "false",
  });
  const bucket = process.env.S3_BUCKET_PIPELINES || "karet-pipelines";
  let store;
  try {
    const res = await s3.send(new GetObjectCommand({ Bucket: bucket, Key: "_auth/users.json" }));
    store = JSON.parse(await res.Body.transformToString());
  } catch {
    console.log("No _auth/users.json found; nothing to import.");
    return;
  }
  let imported = 0;
  for (const u of store.users ?? []) {
    if (!u?.username || !ROLES.includes(u.role) || !u.password_hash) {
      console.log(`  skipped ${u?.username ?? "<unnamed>"}: incomplete or unknown role`);
      continue;
    }
    if (await findUser(u.username)) {
      console.log(`  ${u.username}: already present`);
      continue;
    }
    // The hash format is unchanged, so imported accounts keep their passwords.
    await createUser(u.username, u.role, u.password_hash);
    console.log(`  ${u.username}: imported as ${u.role}`);
    imported += 1;
  }
  console.log(`${imported} account(s) imported. The S3 store is now unused and safe to delete.`);
}

const [command, username, role] = process.argv.slice(2);
await client.connect();

try {
  switch (command) {
    case "list": {
      const { rows } = await client.query(
        `SELECT u.username, u.role, u."createdAt",
                (SELECT count(*) FROM session s WHERE s."userId" = u.id) AS sessions
           FROM "user" u ORDER BY u.username`,
      );
      if (rows.length === 0) {
        console.log("No accounts. The bootstrap admin comes from KARET_ADMIN_PASSWORD_HASH.");
        break;
      }
      for (const r of rows) {
        console.log(`${r.role.padEnd(6)}  ${r.username.padEnd(20)}  ${r.sessions} session(s)`);
      }
      break;
    }
    case "add": {
      if (!username) { console.error("Usage: add <username> <role>"); process.exit(1); }
      if (await findUser(username)) {
        console.error(`${username} already exists; use set-role or set-password.`);
        process.exit(1);
      }
      await createUser(username, requireRole(role), await newPassword());
      console.log(`Added ${username} as ${role}.`);
      break;
    }
    case "set-role": {
      const user = await findUser(username);
      if (!user) { console.error(`No such user: ${username}`); process.exit(1); }
      await client.query(`UPDATE "user" SET role = $2, "updatedAt" = now() WHERE id = $1`, [
        user.id,
        requireRole(role),
      ]);
      const ended = await revokeSessions(user.id);
      console.log(`${username} is now ${role}; ${ended} session(s) ended.`);
      break;
    }
    case "set-password": {
      const user = await findUser(username);
      if (!user) { console.error(`No such user: ${username}`); process.exit(1); }
      await client.query(
        `UPDATE account SET password = $2, "updatedAt" = now()
          WHERE "userId" = $1 AND "providerId" = 'credential'`,
        [user.id, await newPassword()],
      );
      const ended = await revokeSessions(user.id);
      console.log(`Password updated for ${username}; ${ended} session(s) ended.`);
      break;
    }
    case "remove": {
      const user = await findUser(username);
      if (!user) { console.error(`No such user: ${username}`); process.exit(1); }
      // Sessions and credentials cascade from the user row.
      await client.query(`DELETE FROM "user" WHERE id = $1`, [user.id]);
      console.log(`Removed ${username}.`);
      break;
    }
    case "import-s3":
      await importFromS3();
      break;
    default:
      console.error("Commands: list | add | set-role | set-password | remove | import-s3");
      process.exit(1);
  }
} finally {
  await client.end();
}
