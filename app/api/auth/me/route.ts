import { NextResponse } from "next/server";
import { currentPrincipal } from "@/lib/auth/current-user";

export const runtime = "nodejs";

// Read-only. Changing your own display name or password is `PATCH /api/account`.

export async function GET() {
  const principal = await currentPrincipal();
  if (!principal) {
    return NextResponse.json({ authenticated: false }, { status: 401 });
  }
  return NextResponse.json({
    authenticated: true,
    user: {
      username: principal.username,
      displayName: principal.displayName,
      role: principal.role,
      service: principal.service,
    },
  });
}
