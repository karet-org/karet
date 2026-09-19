import { NextResponse } from "next/server";
import { withRole } from "@/lib/auth/guard";
import type { Principal } from "@/lib/auth/service-token";
import { findUserByUsername, listUsers } from "@/lib/auth/users";
import { isRole } from "@/lib/auth/roles";
import {
  getOwner,
  getVisibility,
  grantMembership,
  listMembers,
  revokeMembership,
  setVisibility,
  transferOwnership,
} from "@/lib/auth/pipeline-access";

// The owner's access does not come from the member list, so the list must not
// pretend to control it: narrowing or removing them would appear to work and
// change nothing. Hand the pipeline over instead.
const OWNER_FIXED = {
  error: "owner_access_is_permanent",
  message: "A pipeline's owner keeps admin on it. Transfer ownership instead.",
};

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
    owner: (await getOwner(pipeline))?.username ?? null,
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
    | { username?: string; role?: string; visibility?: string; owner?: string }
    | null;

  if (body?.visibility !== undefined) {
    if (body.visibility !== "instance" && body.visibility !== "members") {
      return NextResponse.json({ error: "invalid_visibility" }, { status: 422 });
    }
    await setVisibility(pipeline, body.visibility);
    return NextResponse.json({ ok: true, visibility: body.visibility });
  }

  if (body?.owner !== undefined) {
    const next = await findUserByUsername(body.owner);
    if (!next) return NextResponse.json({ error: "no_such_user" }, { status: 404 });

    // The route gate only asks for admin *here*, and an editor granted admin on
    // one pipeline could otherwise make their own access permanent by taking
    // ownership of it. Handing a pipeline over is the owner's decision, or the
    // operator's when the owner is gone.
    const current = await getOwner(pipeline);
    const actor = principal.service ? null : await findUserByUsername(principal.username);
    const mayTransfer =
      principal.service || principal.role === "admin" || (actor && current?.userId === actor.id);
    if (!mayTransfer) {
      return NextResponse.json(
        {
          error: "not_owner",
          message: "Only this pipeline's owner or an instance admin can transfer it.",
        },
        { status: 403 },
      );
    }

    await transferOwnership(pipeline, next.id);
    return NextResponse.json({ ok: true, owner: next.username });
  }

  if (!body?.username || !isRole(body.role)) {
    return NextResponse.json({ error: "invalid_grant" }, { status: 422 });
  }
  const target = await findUserByUsername(body.username);
  if (!target) return NextResponse.json({ error: "no_such_user" }, { status: 404 });

  const owner = await getOwner(pipeline);
  if (owner?.userId === target.id && body.role !== "admin") {
    return NextResponse.json(OWNER_FIXED, { status: 422 });
  }

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

  const owner = await getOwner(pipeline);
  if (owner?.userId === target.id) {
    return NextResponse.json(OWNER_FIXED, { status: 422 });
  }

  await revokeMembership(pipeline, target.id);
  return NextResponse.json({ ok: true });
}

export const GET = withRole(handleGet);
export const PUT = withRole(handlePut);
export const DELETE = withRole(handleDelete);
