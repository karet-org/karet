// One account: change its role, or delete it.
//
// Node runtime only.

import { NextResponse } from "next/server";
import { withRole } from "@/lib/auth/guard";
import type { Principal } from "@/lib/auth/service-token";
import { isRole } from "@/lib/auth/roles";
import {
  deleteUser,
  findUserByUsername,
  getAdminUsername,
  pipelinesOwnedBy,
  setRole,
} from "@/lib/auth/users";

/** The environment re-asserts this account as admin on every start. */
function bootstrapRefusal() {
  return NextResponse.json(
    {
      error: "bootstrap_admin",
      message:
        "This account comes from the environment and is restored on restart. " +
        "Change KARET_ADMIN_USERNAME to retire it.",
    },
    { status: 422 },
  );
}

export const dynamic = "force-dynamic";

/** What deleting this account would cost, so the UI can say so before asking. */
async function handleGet(
  _request: Request,
  context: { params: Promise<{ username: string }> },
) {
  const { username } = await context.params;
  const user = await findUserByUsername(username);
  if (!user) return NextResponse.json({ error: "no_such_user" }, { status: 404 });
  return NextResponse.json({ ownedPipelines: await pipelinesOwnedBy(user.id) });
}

/** Change an account's role. Their sessions end, so it takes effect at once. */
async function handlePatch(
  request: Request,
  context: { params: Promise<{ username: string }> },
  principal: Principal,
) {
  const { username } = await context.params;
  const body = (await request.json().catch(() => null)) as { role?: string } | null;
  if (!isRole(body?.role)) {
    return NextResponse.json(
      { error: "invalid_role", message: "Role must be viewer, editor or admin." },
      { status: 422 },
    );
  }

  const user = await findUserByUsername(username);
  if (!user) return NextResponse.json({ error: "no_such_user" }, { status: 404 });

  if (user.username.toLowerCase() === getAdminUsername().toLowerCase()) {
    return bootstrapRefusal();
  }

  // Demoting yourself takes away the page you are standing on, and ends the
  // session doing it. Another admin can do it.
  if (!principal.service && user.username.toLowerCase() === principal.username.toLowerCase()) {
    return NextResponse.json(
      {
        error: "self_role_change",
        message: "You cannot change your own role. Ask another admin.",
      },
      { status: 422 },
    );
  }

  const updated = await setRole(user.username, body.role);
  return NextResponse.json({ ok: true, user: { username: user.username, role: updated?.role } });
}

async function handleDelete(
  _request: Request,
  context: { params: Promise<{ username: string }> },
  principal: Principal,
) {
  const { username } = await context.params;
  const user = await findUserByUsername(username);
  if (!user) return NextResponse.json({ error: "no_such_user" }, { status: 404 });

  // Deleting it would look like it worked and then quietly undo itself.
  if (user.username.toLowerCase() === getAdminUsername().toLowerCase()) {
    return bootstrapRefusal();
  }

  // Deleting your own account would end the session making the request.
  if (!principal.service && user.username.toLowerCase() === principal.username.toLowerCase()) {
    return NextResponse.json(
      {
        error: "self_delete",
        message: "You cannot delete the account you are signed in as.",
      },
      { status: 422 },
    );
  }

  await deleteUser(user.id);
  return NextResponse.json({ ok: true });
}

export const GET = withRole(handleGet);
export const PATCH = withRole(handlePatch);
export const DELETE = withRole(handleDelete);
