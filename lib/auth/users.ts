// Single-admin credential, sourced from the environment.
//
// The scrypt password hash lives in `KARET_ADMIN_PASSWORD_HASH` (generate
// with `npm run hash-password`), not in a bucket: the web service is the
// only party that needs it, so keeping it out of S3 removes it from the
// blast radius of the shared storage credentials, and removes the
// first-run "set admin password" write path entirely — a wiped bucket can
// no longer revert the app to an unauthenticated setup state.
//
// Password changes are an operator action: generate a new hash, update
// the env var, restart. `assertRequiredEnvVars` fails startup when the
// variable is missing.

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
