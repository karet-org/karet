import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { withS3 } from "@/lib/config/s3-client";
import { updateAdminPassword } from "@/lib/auth/users";
import {
  SESSION_COOKIE,
  getSessionSecret,
  issueSessionCookie,
  verifySession,
} from "@/lib/auth/session";

export const runtime = "nodejs";

export async function GET() {
  const jar = await cookies();
  const cookie = jar.get(SESSION_COOKIE)?.value;
  if (!(await verifySession(cookie, getSessionSecret()))) {
    return NextResponse.json({ authenticated: false }, { status: 401 });
  }
  return NextResponse.json({ authenticated: true });
}

export async function PATCH(request: Request) {
  const jar = await cookies();
  const cookie = jar.get(SESSION_COOKIE)?.value;
  if (!(await verifySession(cookie, getSessionSecret()))) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const body = (await request.json().catch(() => null)) as {
    currentPassword?: string;
    newPassword?: string;
  } | null;
  const currentPassword = body?.currentPassword;
  const newPassword = body?.newPassword;
  if (!currentPassword) {
    return NextResponse.json({ error: "missing_current_password" }, { status: 400 });
  }
  if (!newPassword) {
    return NextResponse.json({ error: "missing_new_password" }, { status: 400 });
  }

  return withS3("PATCH /api/auth/me", async (client, cfg) => {
    const result = await updateAdminPassword(
      client,
      cfg.pipelinesBucket,
      currentPassword,
      newPassword,
    );
    if (!result.ok) {
      const status =
        result.reason === "wrong_password"
          ? 401
          : result.reason === "invalid_password"
            ? 422
            : 404;
      return NextResponse.json({ error: result.reason }, { status });
    }
    // Re-issue the cookie so the session keeps its full TTL after a
    // password change.
    return issueSessionCookie(request);
  });
}
