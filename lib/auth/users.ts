// Single-admin credential from the environment.
//
// The scrypt hash lives in KARET_ADMIN_PASSWORD_HASH (generate with
// `npm run hash-password`), not in a bucket: only the web service needs
// it, and with no runtime write path a wiped bucket can't revert the app
// to an unauthenticated setup state. Password change = new hash + restart.

import { verifyPassword } from "./password";

/** Read the admin password hash from the environment, or null when unset/blank. */
export function getAdminPasswordHash(env: Record<string, string | undefined> = process.env): string | null {
  const hash = env.KARET_ADMIN_PASSWORD_HASH;
  return hash && hash.length > 0 ? hash : null;
}

/**
 * Verify a login password against the configured admin hash. Fails closed
 * (returns false) when the hash is missing or malformed — `verifyPassword`
 * rejects anything that doesn't parse as a scrypt hash.
 */
export async function verifyAdminPassword(password: string): Promise<boolean> {
  const hash = getAdminPasswordHash();
  if (!hash) return false;
  return verifyPassword(password, hash);
}
