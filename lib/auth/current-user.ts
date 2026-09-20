// Who is making this request, resolved server-side.
//
// Middleware can only see whether a session cookie exists. This runs in Node
// handlers, where the database is reachable, so it is the authoritative check.
//
// The role comes from the `user` row rather than the session, and a session whose
// account has gone is no session at all. Better-auth caches a validated session in
// the cookie for 30 seconds, which is a fine trade for its own lookup but not for
// authorization: it would leave a demoted editor editing, and a deleted account
// signed in, for half a minute after an admin thought otherwise. One indexed
// lookup buys "at once", and the route guard already makes it for anything
// addressing a pipeline.
//
// Machine callers present `Authorization: Bearer $KARET_WORKER_TOKEN` instead of
// a cookie; see `service-token.ts`, which middleware also uses.

import { headers } from "next/headers";
import { getAuth } from "@/lib/auth/auth";
import { findUserByUsername } from "@/lib/auth/users";
import { serviceTokenPrincipal, type Principal } from "@/lib/auth/service-token";

export { serviceTokenPrincipal, type Principal };

/** The caller, or null when unauthenticated. */
export async function currentPrincipal(): Promise<Principal | null> {
  const requestHeaders = await headers();

  const service = serviceTokenPrincipal(requestHeaders.get("authorization"));
  if (service) return service;

  const session = await getAuth().api.getSession({ headers: requestHeaders });
  if (!session?.user) return null;

  const claimed = session.user.username ?? session.user.name;
  if (!claimed) return null;

  // `findUserByUsername` drops a row whose role is not one of the three, so an
  // unrecognised role reads as no account rather than as a guess.
  const user = await findUserByUsername(claimed);
  if (!user) return null;

  return { username: user.username, role: user.role, service: false };
}
