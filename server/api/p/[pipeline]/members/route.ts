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

// The owner's admin comes from owning the pipeline, so this list must not pretend
// to control it: any grant, removal or role change for them would do nothing.
const OWNER_FIXED = {
  error: "owner_access_is_permanent",
  message: "A pipeline's owner keeps admin on it. Transfer ownership instead.",
};

// Instance admins are admin on every pipeline, so a grant for them would also do nothing.
const INSTANCE_ADMIN_FIXED = {
  error: "instance_admin_access_is_permanent",
  message: "Instance admins have admin on every pipeline, so a grant would change nothing.",
};

/**
 * What the access page draws, returned by reads and writes alike, so a write
 * never makes the page refetch to show what it just did.
 */
async function currentState(pipeline: string) {
  const visibility = await getVisibility(pipeline);
  if (!visibility) return null;
  return {
    visibility,
    owner: (await getOwner(pipeline))?.username ?? null,
    members: await listMembers(pipeline),
  };
}

async function changed(pipeline: string) {
  const state = await currentState(pipeline);
  if (!state) return Response.json({ error: "not_found" }, { status: 404 });
  return Response.json({ ok: true, ...state });
}

/** Who has explicit access here, and whether the pipeline is members-only. */
async function handleGet(
  _request: Request,
  context: { params: Promise<{ pipeline: string }> },
) {
  const { pipeline } = await context.params;
  const state = await currentState(pipeline);
  if (!state) return Response.json({ error: "not_found" }, { status: 404 });
  return Response.json({
    ...state,
    // Offered so the UI can populate a picker without a second endpoint.
    accounts: (await listUsers()).map((u) => ({
      username: u.username,
      displayName: u.displayName,
      role: u.role,
    })),
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
      return Response.json({ error: "invalid_visibility" }, { status: 422 });
    }
    await setVisibility(pipeline, body.visibility);
    return changed(pipeline);
  }

  if (body?.owner !== undefined) {
    const next = await findUserByUsername(body.owner);
    if (!next) return Response.json({ error: "no_such_user" }, { status: 404 });

    // Admin *here* is not enough: an editor granted admin on one pipeline could
    // otherwise take ownership and make their own access permanent.
    const current = await getOwner(pipeline);
    const mayTransfer =
      principal.service ||
      principal.role === "admin" ||
      (principal.userId !== null && current?.userId === principal.userId);
    if (!mayTransfer) {
      return Response.json(
        {
          error: "not_owner",
          message: "Only this pipeline's owner or an instance admin can transfer it.",
        },
        { status: 403 },
      );
    }

    await transferOwnership(pipeline, next.id);
    return changed(pipeline);
  }

  if (!body?.username || !isRole(body.role)) {
    return Response.json({ error: "invalid_grant" }, { status: 422 });
  }
  const target = await findUserByUsername(body.username);
  if (!target) return Response.json({ error: "no_such_user" }, { status: 404 });

  const owner = await getOwner(pipeline);
  if (owner?.userId === target.id) {
    return Response.json(OWNER_FIXED, { status: 422 });
  }
  if (target.role === "admin") {
    return Response.json(INSTANCE_ADMIN_FIXED, { status: 422 });
  }

  await grantMembership(pipeline, target.id, body.role, principal.userId);
  return changed(pipeline);
}

async function handleDelete(
  request: Request,
  context: { params: Promise<{ pipeline: string }> },
) {
  const { pipeline } = await context.params;
  const username = new URL(request.url).searchParams.get("username");
  if (!username) return Response.json({ error: "missing_username" }, { status: 422 });
  const target = await findUserByUsername(username);
  if (!target) return Response.json({ error: "no_such_user" }, { status: 404 });

  const owner = await getOwner(pipeline);
  if (owner?.userId === target.id) {
    return Response.json(OWNER_FIXED, { status: 422 });
  }

  await revokeMembership(pipeline, target.id);
  return changed(pipeline);
}

export const GET = withRole(handleGet);
export const PUT = withRole(handlePut);
export const DELETE = withRole(handleDelete);
