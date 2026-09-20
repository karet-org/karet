// Accounts, so running Karet does not require shell access to the host.
// `scripts/manage-users.mjs` does the same for an operator at a terminal, and is
// the way back in if every admin account is lost.
//
// Node runtime only.

import { NextResponse } from "next/server";
import { withRole } from "@/lib/auth/guard";
import { hashPassword } from "@/lib/auth/password";
import { isRole } from "@/lib/auth/roles";
import { passwordProblem, usernameProblem } from "@/lib/auth/account-rules";
import {
  createUser,
  findUserByUsername,
  getAdminUsername,
  listUsers,
} from "@/lib/auth/users";

export const dynamic = "force-dynamic";

async function handleGet() {
  // Marked so the UI can say why that row has no controls.
  const bootstrap = getAdminUsername().toLowerCase();
  const users = (await listUsers()).map((u) => ({
    username: u.username,
    role: u.role,
    createdAt: u.createdAt,
    bootstrap: u.username.toLowerCase() === bootstrap,
  }));
  return NextResponse.json({ users });
}

async function handlePost(request: Request) {
  const body = (await request.json().catch(() => null)) as {
    username?: string;
    password?: string;
    role?: string;
  } | null;

  const username = body?.username?.trim() ?? "";
  const password = body?.password ?? "";

  const badUsername = usernameProblem(username);
  if (badUsername) {
    return NextResponse.json({ error: "invalid_username", message: badUsername }, { status: 422 });
  }
  const badPassword = passwordProblem(password);
  if (badPassword) {
    return NextResponse.json({ error: "weak_password", message: badPassword }, { status: 422 });
  }
  if (!isRole(body?.role)) {
    return NextResponse.json(
      { error: "invalid_role", message: "Role must be viewer, editor or admin." },
      { status: 422 },
    );
  }
  if (await findUserByUsername(username)) {
    return NextResponse.json(
      { error: "already_exists", message: `${username} already has an account.` },
      { status: 409 },
    );
  }

  const user = await createUser(username, body.role, await hashPassword(password));
  return NextResponse.json(
    { ok: true, user: { username: user.username, role: user.role, createdAt: user.createdAt } },
    { status: 201 },
  );
}

export const GET = withRole(handleGet);
export const POST = withRole(handlePost);
