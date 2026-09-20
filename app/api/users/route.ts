// Accounts, for an admin managing their team.
//
// This exists so running Karet does not require shell access to the host.
// `scripts/manage-users.mjs` still does the same things for an operator who is
// already at a terminal, and remains the only way in if every admin account is
// lost, since the bootstrap admin is re-asserted from the environment.
//
// Node runtime only.

import { NextResponse } from "next/server";
import { withRole } from "@/lib/auth/guard";
import { hashPassword } from "@/lib/auth/password";
import { isRole } from "@/lib/auth/roles";
import {
  MIN_PASSWORD_LENGTH,
  USERNAME_PATTERN,
  createUser,
  findUserByUsername,
  getAdminUsername,
  listUsers,
} from "@/lib/auth/users";

export const dynamic = "force-dynamic";

async function handleGet() {
  // The bootstrap admin is marked so the UI can explain why it cannot be
  // deleted: the environment would recreate it on the next restart.
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

  if (!USERNAME_PATTERN.test(username)) {
    return NextResponse.json(
      {
        error: "invalid_username",
        message: "Use 3 to 32 letters, numbers, underscores or dots.",
      },
      { status: 422 },
    );
  }
  if (password.length < MIN_PASSWORD_LENGTH) {
    return NextResponse.json(
      {
        error: "weak_password",
        message: `Password must be at least ${MIN_PASSWORD_LENGTH} characters.`,
      },
      { status: 422 },
    );
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
