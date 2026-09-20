// Delete one account.
//
// Node runtime only.

import { NextResponse } from "next/server";
import { withRole } from "@/lib/auth/guard";
import type { Principal } from "@/lib/auth/service-token";
import {
  deleteUser,
  findUserByUsername,
  getAdminUsername,
  pipelinesOwnedBy,
} from "@/lib/auth/users";

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

async function handleDelete(
  _request: Request,
  context: { params: Promise<{ username: string }> },
  principal: Principal,
) {
  const { username } = await context.params;
  const user = await findUserByUsername(username);
  if (!user) return NextResponse.json({ error: "no_such_user" }, { status: 404 });

  // The environment recreates this account on the next restart, so deleting it
  // would look like it worked and then quietly undo itself.
  if (user.username.toLowerCase() === getAdminUsername().toLowerCase()) {
    return NextResponse.json(
      {
        error: "bootstrap_admin",
        message:
          "This account comes from the environment and is recreated on restart. " +
          "Change KARET_ADMIN_USERNAME to retire it.",
      },
      { status: 422 },
    );
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
export const DELETE = withRole(handleDelete);
