// Your own account: what you are called, and your password.
//
// Separate from `/api/users`, which is admin-only and about other people. This is
// the one account route any signed-in role may use, and it only ever addresses the
// caller: the username comes from the session, never from the body.
//
// Node runtime only.

import { NextResponse } from "next/server";
import { withRole } from "@/lib/auth/guard";
import type { Principal } from "@/lib/auth/service-token";
import { changeOwnDisplayName, changeOwnPassword } from "@/lib/auth/account-admin";
import { respond } from "@/lib/http/respond";

export const dynamic = "force-dynamic";

async function handlePatch(request: Request, _context: unknown, principal: Principal) {
  const body = (await request.json().catch(() => null)) as {
    displayName?: string;
    currentPassword?: string;
    newPassword?: string;
  } | null;

  if (body?.newPassword !== undefined) {
    return respond(
      await changeOwnPassword(principal, body.currentPassword, body.newPassword),
      (v) => NextResponse.json({ ok: true, username: v.username }),
    );
  }

  return respond(await changeOwnDisplayName(principal, body?.displayName), (v) =>
    NextResponse.json({ ok: true, displayName: v.displayName }),
  );
}

export const PATCH = withRole(handlePatch);
