// Route-level authorization.
//
// Middleware refused anything without a session cookie. This is the
// authoritative pass, and it answers two questions rather than one:
//
//   * what does this request need? — the policy table, keyed on method and path
//   * what does this caller have *here*? — their instance role, narrowed or
//     widened by a per-pipeline membership
//
// Resolving against the pipeline is why authorization cannot live in middleware:
// the answer depends on rows, and the edge cannot read them.
//
// Node runtime only.

import { NextResponse } from "next/server";
import { currentPrincipal, type Principal } from "@/lib/auth/current-user";
import { effectiveRoleFor } from "@/lib/auth/pipeline-access";
import { pipelineFromPath, requiredRole } from "@/lib/auth/policy";
import { roleAtLeast, type Role } from "@/lib/auth/roles";

/**
 * Wrap a route handler so it runs only for a caller who may do this, here.
 *
 * The required role is not passed in: taking it from the same table middleware
 * uses means a route cannot quietly disagree with the gate in front of it.
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

    const { pathname } = new URL(request.url);
    const needed = requiredRole(request.method, pathname);
    if (!needed) return handler(request, context, principal);

    const pipeline = pipelineFromPath(pathname);
    let held: Role | null = principal.role;

    if (pipeline) {
      held = await effectiveRoleFor(principal, pipeline);
    }

    if (held === null) {
      // Members-only and they are not a member. 404 rather than 403: telling
      // someone a pipeline exists but is not for them leaks its existence, and
      // they cannot act on the information either way.
      return NextResponse.json({ error: "not_found" }, { status: 404 });
    }
    if (!roleAtLeast(held, needed)) {
      return NextResponse.json(
        {
          error: "forbidden",
          message: `this action needs the ${needed} role; you have ${held}${
            pipeline ? " on this pipeline" : ""
          }`,
        },
        { status: 403 },
      );
    }

    return handler(request, context, principal);
  };
}
