// The machine identity: `Authorization: Bearer $KARET_WORKER_TOKEN`.
//
// Machine callers (the log shipper, cron, anything scripted) present this
// instead of a session cookie. The token already authorizes the worker's own
// API, so it grants an admin-equivalent service identity rather than a new
// privilege.
//
// Edge-safe: middleware checks this before the cookie, so no Node built-ins or
// S3 imports here.

import type { Role } from "./roles";

export interface Principal {
  username: string;
  /** What this person calls themselves. Absent for the service token. */
  displayName?: string;
  role: Role;
  /** True for the service token: not a person, has no stored account. */
  service: boolean;
}

/** Constant-time string compare, so a token guess can't be timed. */
function tokensMatch(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

export function serviceTokenPrincipal(
  authorization: string | null,
  env: Record<string, string | undefined> = process.env,
): Principal | null {
  const expected = env.KARET_WORKER_TOKEN;
  if (!expected || expected.length === 0) return null;
  const presented = authorization?.startsWith("Bearer ")
    ? authorization.slice("Bearer ".length)
    : null;
  if (!presented || !tokensMatch(presented, expected)) return null;
  return { username: "service", role: "admin", service: true };
}
