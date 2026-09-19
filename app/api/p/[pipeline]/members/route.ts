import { NextResponse } from "next/server";
import { withRole } from "@/lib/auth/guard";
import type { Principal } from "@/lib/auth/service-token";
import { findUserByUsername, listUsers } from "@/lib/auth/users";
import { isRole } from "@/lib/auth/roles";
import {
  getVisibility,
  grantMembership,
  listMembers,
  revokeMembership,
  setVisibility,
} from "@/lib/auth/pipeline-access";

export const dynamic = "force-dynamic";

/** Who has explicit access here, and whether the pipeline is members-only. */
async function handleGet(
  _request: Request,
  context: { params: Promise<{ pipeline: string }> },
) {
  const { pipeline } = await context.params;
  const visibility = await getVisibility(pipeline);
  if (!visibility) return NextResponse.json({ error: "not_found" }, { status: 404 });
  return NextResponse.json({
    visibility,
    members: await listMembers(pipeline),
    // Offered so the UI can populate a picker without a second endpoint.
    accounts: (await listUsers()).map((u) => ({ username: u.username, role: u.role })),
  });
}

/** Grant or change one person's access, or flip the pipeline's visibility. */
async function handlePut(
  request: Request,
  context: { params: Promise<{ pipeline: string }> },
  principal: Principal,
) {
  const { pipeline } = await context.params;
  const body = (await request.json().catch(() => null)) as
    | { username?: string; role?: string; visibility?: string }
    | null;

  if (body?.visibility !== undefined) {
    if (body.visibility !== "instance" && body.visibility !== "members") {
      return NextResponse.json({ error: "invalid_visibility" }, { status: 422 });
    }
    await setVisibility(pipeline, body.visibility);
    return NextResponse.json({ ok: true, visibility: body.visibility });
  }

  if (!body?.username || !isRole(body.role)) {
    return NextResponse.json({ error: "invalid_grant" }, { status: 422 });
  }
  const target = await findUserByUsername(body.username);
  if (!target) return NextResponse.json({ error: "no_such_user" }, { status: 404 });

  const granter = principal.service ? null : await findUserByUsername(principal.username);
  await grantMembership(pipeline, target.id, body.role, granter?.id ?? null);
  return NextResponse.json({ ok: true, username: target.username, role: body.role });
}

async function handleDelete(
  request: Request,
  context: { params: Promise<{ pipeline: string }> },
) {
  const { pipeline } = await context.params;
  const username = new URL(request.url).searchParams.get("username");
  if (!username) return NextResponse.json({ error: "missing_username" }, { status: 422 });
  const target = await findUserByUsername(username);
  if (!target) return NextResponse.json({ error: "no_such_user" }, { status: 404 });
  await revokeMembership(pipeline, target.id);
  return NextResponse.json({ ok: true });
}

export const GET = withRole(handleGet);
export const PUT = withRole(handlePut);
export const DELETE = withRole(handleDelete);
