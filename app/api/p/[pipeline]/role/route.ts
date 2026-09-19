// The caller's role on one pipeline, for drawing controls.
//
// `/api/auth/me` carries the instance role, which is the wrong answer once a
// membership can widen or narrow it: the creator of a pipeline is admin on it
// while being an editor everywhere else, so a sidebar keyed on the instance role
// hides Rename and Delete from the one person who owns the thing.
//
// Presentation only, like the rest of the role plumbing in the client. The guard
// has already 404'd a non-member by the time this handler runs, so the role it
// returns is never null.

import { NextResponse } from "next/server";
import { withRole } from "@/lib/auth/guard";
import { effectiveRoleFor } from "@/lib/auth/pipeline-access";
import { findUserByUsername } from "@/lib/auth/users";
import type { Principal } from "@/lib/auth/service-token";

export const dynamic = "force-dynamic";

async function handleGet(
  _request: Request,
  context: { params: Promise<{ pipeline: string }> },
  principal: Principal,
) {
  const { pipeline } = await context.params;
  const user = principal.service ? null : await findUserByUsername(principal.username);
  const role = await effectiveRoleFor(principal, pipeline, user?.id ?? null);
  return NextResponse.json({ role });
}

export const GET = withRole(handleGet);
