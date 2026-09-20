// Who is making this request, resolved server-side.
//
// Middleware can only see whether a session cookie exists. This runs in Node
// handlers, where the database is reachable, so it is the authoritative check:
// better-auth validates the session against the `session` table, which means a
// deleted session or a demoted account is caught here rather than whenever a
// cookie would have expired.
//
// Machine callers present `Authorization: Bearer $KARET_WORKER_TOKEN` instead of
// a cookie; see `service-token.ts`, which middleware also uses.

import { headers } from "next/headers";
import { getAuth } from "@/lib/auth/auth";
import { isRole, type Role } from "@/lib/auth/roles";
import { serviceTokenPrincipal, type Principal } from "@/lib/auth/service-token";

export { serviceTokenPrincipal, type Principal };

/** The caller, or null when unauthenticated. */
export async function currentPrincipal(): Promise<Principal | null> {
  const requestHeaders = await headers();

  const service = serviceTokenPrincipal(requestHeaders.get("authorization"));
  if (service) return service;

  const session = await getAuth().api.getSession({ headers: requestHeaders });
  if (!session?.user) return null;

  const username = session.user.username ?? session.user.name;
  if (!username) return null;

  // The column is constrained to the three roles, but a row could predate that
  // constraint; treat anything unrecognised as the least privilege rather than
  // trusting it.
  const role: Role = isRole(session.user.role) ? session.user.role : "viewer";
  return { username, role, service: false };
}
