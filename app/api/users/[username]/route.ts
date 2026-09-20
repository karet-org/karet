// One account: change its role, or delete it.
//
// Node runtime only.

import { NextResponse } from "next/server";
import { withRole } from "@/lib/auth/guard";
import type { Principal } from "@/lib/auth/service-token";
import { isRole } from "@/lib/auth/roles";
import { hashPassword } from "@/lib/auth/password";
import {
  MIN_PASSWORD_LENGTH,
  deleteUser,
  findUserByUsername,
  getAdminUsername,
  pipelinesOwnedBy,
  setPassword,
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

/**
 * Change an account's role, or set a new password. Either ends that account's
 * sessions, so neither waits on a cookie to expire.
 */
async function handlePatch(
  request: Request,
  context: { params: Promise<{ username: string }> },
  principal: Principal,
) {
  const { username } = await context.params;
  const body = (await request.json().catch(() => null)) as {
    role?: string;
    password?: string;
  } | null;

  const user = await findUserByUsername(username);
  if (!user) return NextResponse.json({ error: "no_such_user" }, { status: 404 });

  // The environment owns this account's password and role; a change here would
  // last until the next restart and no longer.
  if (user.username.toLowerCase() === getAdminUsername().toLowerCase()) {
    return bootstrapRefusal();
  }

  if (body?.password !== undefined) {
    if (body.password.length < MIN_PASSWORD_LENGTH) {
      return NextResponse.json(
        {
          error: "weak_password",
          message: `Password must be at least ${MIN_PASSWORD_LENGTH} characters.`,
        },
        { status: 422 },
      );
    }
    // Resetting your own password is allowed: it signs you out, which is honest
    // about what a reset does, rather than being something only a colleague can
    // do for you.
    await setPassword(user.id, await hashPassword(body.password));
    return NextResponse.json({ ok: true, username: user.username });
  }

  if (!isRole(body?.role)) {
    return NextResponse.json(
      { error: "invalid_role", message: "Role must be viewer, editor or admin." },
      { status: 422 },
    );
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
