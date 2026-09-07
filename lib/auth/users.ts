// Single-admin credential from KARET_ADMIN_PASSWORD_HASH, not a bucket: with no
// runtime write path, a wiped bucket can't revert the app to unauthenticated setup.

import { verifyPassword } from "./password";

/** The admin password hash, or null when unset/blank. */
export function getAdminPasswordHash(env: Record<string, string | undefined> = process.env): string | null {
  const hash = env.KARET_ADMIN_PASSWORD_HASH;
  return hash && hash.length > 0 ? hash : null;
}

/** Verify a login password against the admin hash; fails closed when the hash
 * is missing or malformed. */
export async function verifyAdminPassword(password: string): Promise<boolean> {
  const hash = getAdminPasswordHash();
  if (!hash) return false;
  return verifyPassword(password, hash);
}
