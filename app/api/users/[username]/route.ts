// One account: its deletion cost, a role change, a password reset, a deletion.
// The rules live in `lib/auth/account-admin.ts`.
//
// Node runtime only.

import { NextResponse } from "next/server";
import { withRole } from "@/lib/auth/guard";
import type { Principal } from "@/lib/auth/service-token";
import { changeRole, deletionCost, removeAccount, resetPassword } from "@/lib/auth/account-admin";
import { respond } from "@/lib/http/respond";

export const dynamic = "force-dynamic";

type Context = { params: Promise<{ username: string }> };

async function handleGet(_request: Request, context: Context) {
  const { username } = await context.params;
  return respond(await deletionCost(username), (cost) => NextResponse.json(cost));
}

/** A role change or a password reset. Either ends that account's sessions. */
async function handlePatch(request: Request, context: Context, principal: Principal) {
  const { username } = await context.params;
  const body = (await request.json().catch(() => null)) as {
    role?: string;
    password?: string;
  } | null;

  if (body?.password !== undefined) {
    return respond(await resetPassword(username, body.password), (v) =>
      NextResponse.json({ ok: true, username: v.username }),
    );
  }

  return respond(await changeRole(principal, username, body?.role), (v) =>
    NextResponse.json({ ok: true, user: v }),
  );
}

async function handleDelete(_request: Request, context: Context, principal: Principal) {
  const { username } = await context.params;
  return respond(await removeAccount(principal, username), () => NextResponse.json({ ok: true }));
}

export const GET = withRole(handleGet);
export const PATCH = withRole(handlePatch);
export const DELETE = withRole(handleDelete);
