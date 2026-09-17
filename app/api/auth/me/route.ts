import { NextResponse } from "next/server";
import { currentPrincipal } from "@/lib/auth/current-user";

export const runtime = "nodejs";

// Password changes go through `scripts/manage-users.mjs` (or, for the bootstrap
// admin, a new KARET_ADMIN_PASSWORD_HASH), so there is no PATCH here.

export async function GET() {
  const principal = await currentPrincipal();
  if (!principal) {
    return NextResponse.json({ authenticated: false }, { status: 401 });
  }
  return NextResponse.json({
    authenticated: true,
    user: {
      username: principal.username,
      role: principal.role,
      service: principal.service,
    },
  });
}
