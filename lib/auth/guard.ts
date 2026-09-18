// Route-level authorization.
//
// Middleware already refused anything whose signed role is too low. This is the
// authoritative pass: it resolves the caller against the user store, so a
// demoted, password-rotated or deleted account is caught here rather than
// waiting for its cookie to expire.
//
// Node runtime only.

import { NextResponse } from "next/server";
import { currentPrincipal, type Principal } from "@/lib/auth/current-user";
import { requiredRole } from "@/lib/auth/policy";
import { roleAtLeast, type Role } from "@/lib/auth/roles";

/**
 * Wrap a route handler so it runs only for a caller with at least the role the
 * policy table demands for that request.
 *
 * The role is not passed in: taking it from the same table middleware uses
 * means a route cannot quietly disagree with the gate in front of it.
 */
export function withRole<C>(
  handler: (request: Request, context: C, principal: Principal) => Promise<Response>,
): (request: Request, context: C) => Promise<Response> {
  return async (request: Request, context: C) => {
    const principal = await currentPrincipal();
    if (!principal) {
      return NextResponse.json(
        { error: "unauthorized", message: "missing or invalid session" },
        { status: 401 },
      );
    }
    const needed = neededRole(request);
    if (needed && !roleAtLeast(principal.role, needed)) {
      return NextResponse.json(
        {
          error: "forbidden",
          message: `this action needs the ${needed} role; you are ${principal.role}`,
        },
        { status: 403 },
      );
    }
    return handler(request, context, principal);
  };
}

function neededRole(request: Request): Role | null {
  const { pathname } = new URL(request.url);
  return requiredRole(request.method, pathname);
}
