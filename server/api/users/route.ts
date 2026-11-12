// Accounts. The rules live in `lib/auth/account-admin.ts`; this maps an Outcome
// to a status.
//
// Node runtime only.

import { withRole } from "@/lib/auth/guard";
import { accounts, createAccount } from "@/lib/auth/account-admin";
import { respond } from "@/lib/http/respond";

async function handleGet() {
  return Response.json({ users: await accounts() });
}

async function handlePost(request: Request) {
  const body = (await request.json().catch(() => null)) as {
    username?: string;
    password?: string;
    role?: string;
  } | null;

  return respond(await createAccount(body ?? {}), (user) =>
    Response.json(
      { ok: true, user: { username: user.username, role: user.role, createdAt: user.createdAt } },
      { status: 201 },
    ),
  );
}

export const GET = withRole(handleGet);
export const POST = withRole(handlePost);
