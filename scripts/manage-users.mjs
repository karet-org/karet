#!/usr/bin/env node
// Manage team accounts in `_auth/users.json` in the pipelines bucket.
//
//   node scripts/manage-users.mjs list
//   node scripts/manage-users.mjs add <username> <viewer|editor|admin>
//   node scripts/manage-users.mjs set-role <username> <role>
//   node scripts/manage-users.mjs set-password <username>
//   node scripts/manage-users.mjs remove <username>
//
// `add` and `set-password` read the password from stdin, so it stays out of
// shell history. The bootstrap admin lives in KARET_ADMIN_PASSWORD_HASH and is
// not managed here.
//
// KEEP IN SYNC with lib/auth/password.ts and lib/auth/users.ts: same hash
// format and cost params, same file shape. Pinned by
// lib/auth/__tests__/manage-users-parity.test.ts.

import { GetObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { randomBytes, scrypt as scryptCb } from "node:crypto";
import { createInterface } from "node:readline";

const BUCKET = process.env.S3_BUCKET_PIPELINES || "karet-pipelines";
const KEY = "_auth/users.json";
const ROLES = ["viewer", "editor", "admin"];

const KEY_LEN = 64;
const SALT_LEN = 16;
const N = 131072;
const R = 8;
const P = 1;

const client = new S3Client({
  region: process.env.AWS_REGION || "us-east-1",
  endpoint: process.env.AWS_ENDPOINT_URL || undefined,
  forcePathStyle: process.env.S3_FORCE_PATH_STYLE !== "false",
});

function hashPassword(password) {
  const salt = randomBytes(SALT_LEN);
  return new Promise((resolve, reject) => {
    scryptCb(
      password,
      salt,
      KEY_LEN,
      { N, r: R, p: P, maxmem: 256 * N * R * P },
      (err, derived) =>
        err
          ? reject(err)
          : resolve(["scrypt", N, R, P, salt.toString("base64"), derived.toString("base64")].join("$")),
    );
  });
}

function askPassword(prompt) {
  const rl = createInterface({ input: process.stdin, output: process.stderr });
  return new Promise((resolve) => rl.question(prompt, (a) => { rl.close(); resolve(a); }));
}

async function readStore() {
  try {
    const res = await client.send(new GetObjectCommand({ Bucket: BUCKET, Key: KEY }));
    const parsed = JSON.parse(await res.Body.transformToString());
    return Array.isArray(parsed?.users) ? parsed : { version: 1, users: [] };
  } catch {
    return { version: 1, users: [] };
  }
}

async function writeStore(store) {
  await client.send(
    new PutObjectCommand({
      Bucket: BUCKET,
      Key: KEY,
      Body: JSON.stringify({ version: 1, users: store.users }, null, 2),
      ContentType: "application/json",
    }),
  );
}

function requireRole(role) {
  if (!ROLES.includes(role)) {
    console.error(`Role must be one of: ${ROLES.join(", ")}`);
    process.exit(1);
  }
  return role;
}

async function newPassword() {
  const password = (await askPassword("Password: ")).trim();
  if (password.length < 8) {
    console.error("Password must be at least 8 characters.");
    process.exit(1);
  }
  return hashPassword(password);
}

const [command, username, role] = process.argv.slice(2);
const store = await readStore();
const existing = store.users.find((u) => u.username === username);

switch (command) {
  case "list": {
    if (store.users.length === 0) {
      console.log("No team accounts. The bootstrap admin comes from KARET_ADMIN_PASSWORD_HASH.");
      break;
    }
    for (const u of store.users) console.log(`${u.role.padEnd(6)}  ${u.username}`);
    break;
  }
  case "add": {
    if (!username) { console.error("Usage: add <username> <role>"); process.exit(1); }
    if (existing) { console.error(`${username} already exists; use set-role or set-password.`); process.exit(1); }
    store.users.push({ username, role: requireRole(role), password_hash: await newPassword() });
    await writeStore(store);
    console.log(`Added ${username} as ${role}.`);
    break;
  }
  case "set-role": {
    if (!existing) { console.error(`No such user: ${username}`); process.exit(1); }
    existing.role = requireRole(role);
    await writeStore(store);
    // Changing a role changes the credential fingerprint, so their sessions end.
    console.log(`${username} is now ${role}; their existing sessions are invalidated.`);
    break;
  }
  case "set-password": {
    if (!existing) { console.error(`No such user: ${username}`); process.exit(1); }
    existing.password_hash = await newPassword();
    await writeStore(store);
    console.log(`Password updated for ${username}; their existing sessions are invalidated.`);
    break;
  }
  case "remove": {
    if (!existing) { console.error(`No such user: ${username}`); process.exit(1); }
    store.users = store.users.filter((u) => u.username !== username);
    await writeStore(store);
    console.log(`Removed ${username}.`);
    break;
  }
  default:
    console.error("Commands: list | add | set-role | set-password | remove");
    process.exit(1);
}
