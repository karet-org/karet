import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import {
  SESSION_COOKIE,
  getSessionSecret,
  verifySession,
} from "@/lib/auth/session";

export const runtime = "nodejs";

// Password changes are an operator action (regenerate
// KARET_ADMIN_PASSWORD_HASH and restart), so there is no PATCH here.

export async function GET() {
  const jar = await cookies();
  const cookie = jar.get(SESSION_COOKIE)?.value;
  if (!(await verifySession(cookie, getSessionSecret()))) {
    return NextResponse.json({ authenticated: false }, { status: 401 });
  }
  return NextResponse.json({ authenticated: true });
}
