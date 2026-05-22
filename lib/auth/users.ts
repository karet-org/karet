// Single-admin store -- one S3 object at `_auth/admin.json`.

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

const ADMIN_KEY = "_auth/admin.json";

interface AdminFile {
  version: 1;
  password_hash: string;
  created_at: string;
}

function isNotFound(err: unknown): boolean {
  if (err instanceof NoSuchKey) return true;
  if (err instanceof S3ServiceException) {
    return err.name === "NoSuchKey" || err.$metadata?.httpStatusCode === 404;
  }
  return false;
}

async function readAdminFile(
  client: S3Client,
  bucket: string,
): Promise<AdminFile | null> {
  try {
    const res = await client.send(
      new GetObjectCommand({ Bucket: bucket, Key: ADMIN_KEY }),
    );
    const body = (await readBodyToBuffer(res.Body)).toString("utf-8");
    const parsed = JSON.parse(body) as AdminFile;
    if (parsed.version !== 1 || typeof parsed.password_hash !== "string") {
      return null;
    }
    return parsed;
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
 * Change the admin password. Always requires the current password --
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
 * Always runs `verifyPassword` once -- even when no admin exists -- so
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
