// Single-admin store — one S3 object at `_auth/admin.json`.
//
// Lazily migrates the legacy multi-user file at `_auth/users.json` (the
// project shipped with that shape originally — it carried at most one
// admin in practice). Migration preserves the existing password hash so
// already-deployed installs don't have to re-set their password.

import { randomBytes } from "node:crypto";
import {
  GetObjectCommand,
  NoSuchKey,
  PutObjectCommand,
  S3Client,
  S3ServiceException,
} from "@aws-sdk/client-s3";
import { readBodyToBuffer } from "@/lib/services/s3-helpers";
import { hashPassword, verifyPassword } from "./password";

export const ADMIN_KEY = "_auth/admin.json";
const LEGACY_USERS_KEY = "_auth/users.json";

interface AdminFile {
  version: 1;
  password_hash: string;
  created_at: string;
}

interface LegacyUserRecord {
  username: string;
  password_hash: string;
  created_at: string;
}
interface LegacyUsersFile {
  version: 1;
  users: LegacyUserRecord[];
}

function isNotFound(err: unknown): boolean {
  if (err instanceof NoSuchKey) return true;
  if (err instanceof S3ServiceException) {
    return err.name === "NoSuchKey" || err.$metadata?.httpStatusCode === 404;
  }
  return false;
}

async function readJsonObject<T>(
  client: S3Client,
  bucket: string,
  key: string,
): Promise<T | null> {
  try {
    const res = await client.send(new GetObjectCommand({ Bucket: bucket, Key: key }));
    const body = (await readBodyToBuffer(res.Body)).toString("utf-8");
    return JSON.parse(body) as T;
  } catch (err) {
    if (isNotFound(err)) return null;
    throw err;
  }
}

async function writeAdminFile(
  client: S3Client,
  bucket: string,
  file: AdminFile,
): Promise<void> {
  await client.send(
    new PutObjectCommand({
      Bucket: bucket,
      Key: ADMIN_KEY,
      Body: JSON.stringify(file, null, 2),
      ContentType: "application/json",
    }),
  );
}

/**
 * Read the admin record. If `_auth/admin.json` is missing but the legacy
 * `_auth/users.json` is present with at least one user, migrate the first
 * user's hash into the new shape and persist. Returns null when no admin
 * has been provisioned at all (drives the first-run flow).
 */
async function readAdminFile(
  client: S3Client,
  bucket: string,
): Promise<AdminFile | null> {
  const current = await readJsonObject<AdminFile>(client, bucket, ADMIN_KEY);
  if (current && current.version === 1 && typeof current.password_hash === "string") {
    return current;
  }
  const legacy = await readJsonObject<LegacyUsersFile>(client, bucket, LEGACY_USERS_KEY);
  if (legacy && Array.isArray(legacy.users) && legacy.users.length > 0) {
    const first = legacy.users[0];
    const migrated: AdminFile = {
      version: 1,
      password_hash: first.password_hash,
      created_at: first.created_at,
    };
    await writeAdminFile(client, bucket, migrated);
    return migrated;
  }
  return null;
}

/**
 * Returns true iff an admin password has been provisioned. Drives the
 * first-run flow on `/login`.
 */
export async function hasAdmin(client: S3Client, bucket: string): Promise<boolean> {
  return (await readAdminFile(client, bucket)) !== null;
}

/**
 * Provision the admin password. Refuses if one already exists, so the
 * first-run wizard cannot be replayed by a network attacker who finds
 * the setup endpoint open.
 */
export async function createInitialAdmin(
  client: S3Client,
  bucket: string,
  password: string,
): Promise<{ created: boolean }> {
  const existing = await readAdminFile(client, bucket);
  if (existing) return { created: false };
  await writeAdminFile(client, bucket, {
    version: 1,
    password_hash: await hashPassword(password),
    created_at: new Date().toISOString(),
  });
  return { created: true };
}

export type UpdateAdminResult =
  | { ok: true }
  | { ok: false; reason: "wrong_password" | "no_admin" | "invalid_password" };

/**
 * Change the admin password. Always requires the current password —
 * relying solely on the session cookie would let a stolen cookie reset
 * credentials silently. Password rule (≥8 chars) matches the setup endpoint.
 */
export async function updateAdminPassword(
  client: S3Client,
  bucket: string,
  currentPassword: string,
  newPassword: string,
): Promise<UpdateAdminResult> {
  if (newPassword.length < 8) return { ok: false, reason: "invalid_password" };
  const file = await readAdminFile(client, bucket);
  if (!file) return { ok: false, reason: "no_admin" };
  if (!(await verifyPassword(currentPassword, file.password_hash))) {
    return { ok: false, reason: "wrong_password" };
  }
  await writeAdminFile(client, bucket, {
    ...file,
    password_hash: await hashPassword(newPassword),
  });
  return { ok: true };
}

/**
 * Sentinel hash used to make wrong-password timing match right-password
 * timing when no admin exists. Built once at module load against random
 * bytes.
 */
const SENTINEL_HASH_PROMISE: Promise<string> = hashPassword(
  randomBytes(32).toString("base64"),
);

/**
 * Verify a password against the stored admin hash. Returns true on match.
 * Always runs `verifyPassword` once — even when no admin exists — so
 * timing doesn't leak the unprovisioned state.
 */
export async function verifyAdminPassword(
  client: S3Client,
  bucket: string,
  password: string,
): Promise<boolean> {
  const file = await readAdminFile(client, bucket);
  const hashToCheck = file ? file.password_hash : await SENTINEL_HASH_PROMISE;
  const ok = await verifyPassword(password, hashToCheck);
  return !!file && ok;
}
