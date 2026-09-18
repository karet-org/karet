// Users and their credentials.
//
// Two sources, deliberately:
//
//   1. A bootstrap admin from `KARET_ADMIN_USERNAME` / `KARET_ADMIN_PASSWORD_HASH`.
//      Env is the root of trust: a wiped bucket must not be able to lock the
//      operator out, and it must not be able to revert the app to an
//      unauthenticated setup state either.
//   2. Team accounts in `_auth/users.json` in the pipelines bucket, managed with
//      `scripts/manage-users.mjs`.
//
// A missing or unreadable store means "no team accounts", never "let anyone
// in": every login path fails closed.

import { GetObjectCommand } from "@aws-sdk/client-s3";
import { createS3Client, loadS3Config } from "@/lib/config/s3-client";
import { readBodyToBuffer } from "@/lib/services/s3-helpers";
import { verifyPassword } from "./password";
import { isRole, type Role } from "./roles";

export { ROLES, isRole, credentialVersion, roleAtLeast, type Role } from "./roles";

/** Key of the user store, inside the pipelines bucket. */
export const USERS_KEY = "_auth/users.json";

export interface User {
  username: string;
  role: Role;
  /** scrypt hash, `scrypt$N$r$p$salt$hash`. */
  passwordHash: string;
}

/** Wire shape of `_auth/users.json`. */
interface UserStoreFile {
  version: 1;
  users: { username: string; role: string; password_hash: string }[];
}

/** The admin password hash from env, or null when unset/blank. */
export function getAdminPasswordHash(
  env: Record<string, string | undefined> = process.env,
): string | null {
  const hash = env.KARET_ADMIN_PASSWORD_HASH;
  return hash && hash.length > 0 ? hash : null;
}

/** The env-provisioned admin, or null when no hash is configured. */
export function getBootstrapAdmin(
  env: Record<string, string | undefined> = process.env,
): User | null {
  const passwordHash = getAdminPasswordHash(env);
  if (!passwordHash) return null;
  const username = env.KARET_ADMIN_USERNAME?.trim() || "admin";
  return { username, role: "admin", passwordHash };
}

/**
 * Team accounts from the store. Empty when the object is absent, unreadable or
 * malformed: callers treat that as "no team accounts", so a wiped bucket costs
 * access rather than granting it.
 */
export async function readUserStore(): Promise<User[]> {
  const config = loadS3Config();
  try {
    const res = await createS3Client(config).send(
      new GetObjectCommand({ Bucket: config.pipelinesBucket, Key: USERS_KEY }),
    );
    const parsed = JSON.parse((await readBodyToBuffer(res.Body)).toString("utf8")) as UserStoreFile;
    if (!Array.isArray(parsed?.users)) return [];
    return parsed.users.flatMap((u) => {
      if (typeof u?.username !== "string" || typeof u?.password_hash !== "string") return [];
      if (!isRole(u.role)) return [];
      return [{ username: u.username, role: u.role, passwordHash: u.password_hash }];
    });
  } catch {
    return [];
  }
}

/**
 * Every account that can sign in. The bootstrap admin shadows a stored account
 * of the same name, so editing the store cannot demote or lock out the
 * operator.
 */
export async function listUsers(): Promise<User[]> {
  const stored = await readUserStore();
  const admin = getBootstrapAdmin();
  if (!admin) return stored;
  return [admin, ...stored.filter((u) => u.username !== admin.username)];
}

export async function findUser(username: string): Promise<User | null> {
  return (await listUsers()).find((u) => u.username === username) ?? null;
}

/**
 * Verify a username and password. Returns the user on success, null otherwise,
 * and runs scrypt even for an unknown username so a wrong name and a wrong
 * password cost the same time.
 */
export async function verifyCredentials(
  username: string,
  password: string,
): Promise<User | null> {
  const user = await findUser(username);
  const hash = user?.passwordHash ?? getAdminPasswordHash();
  if (!hash) return null;
  const ok = await verifyPassword(password, hash);
  return ok && user ? user : null;
}
