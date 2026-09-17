// Who is making this request, resolved server-side.
//
// Middleware can only check the cookie's signature and expiry at the edge. This
// runs in Node handlers, where the user store is reachable, so it is the
// authoritative check: the account must still exist and its credential
// fingerprint must still match the one in the session.
//
// Machine callers present the service token instead of a cookie; see
// `service-token.ts`, which middleware also uses.

import { cookies, headers } from "next/headers";
import {
  SESSION_COOKIE,
  getSessionKeyMaterial,
  verifySession,
} from "@/lib/auth/session";
import { credentialVersion } from "@/lib/auth/roles";
import { serviceTokenPrincipal, type Principal } from "@/lib/auth/service-token";
import { findUser } from "@/lib/auth/users";

export { serviceTokenPrincipal, type Principal };

/** The caller, or null when unauthenticated. */
export async function currentPrincipal(): Promise<Principal | null> {
  const service = serviceTokenPrincipal((await headers()).get("authorization"));
  if (service) return service;

  const secret = getSessionKeyMaterial();
  if (!secret) return null;
  const claims = await verifySession((await cookies()).get(SESSION_COOKIE)?.value, secret);
  if (!claims) return null;

  // The cookie says who they were; the store says who they are now.
  const user = await findUser(claims.sub);
  if (!user) return null;
  if ((await credentialVersion(user)) !== claims.cv) return null;
  return { username: user.username, role: user.role, service: false };
}
