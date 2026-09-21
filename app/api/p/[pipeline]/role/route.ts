// The caller's role on one pipeline, for drawing controls.
//
// `/api/auth/me` carries the instance role, which is the wrong answer once
// ownership or a membership changes it. Presentation only; the guard has already
// 404'd a non-member, so the role returned here is never null.

import { NextResponse } from "next/server";
import { withRole } from "@/lib/auth/guard";
import { effectiveRoleFor } from "@/lib/auth/pipeline-access";
import type { Principal } from "@/lib/auth/service-token";

export const dynamic = "force-dynamic";

async function handleGet(
  _request: Request,
  context: { params: Promise<{ pipeline: string }> },
  principal: Principal,
) {
  const { pipeline } = await context.params;
  const role = await effectiveRoleFor(principal, pipeline);
  return NextResponse.json({ role });
}

export const GET = withRole(handleGet);
