import { NextResponse } from "next/server";
import { verifyAdminPassword } from "@/lib/auth/users";
import { issueSessionCookie } from "@/lib/auth/session";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as {
    password?: string;
  } | null;
  const password = body?.password;
  if (!password) {
    return NextResponse.json(
      { error: "invalid_credentials" },
      { status: 401 },
    );
  }

  if (!(await verifyAdminPassword(password))) {
    return NextResponse.json(
      { error: "invalid_credentials" },
      { status: 401 },
    );
  }
  return issueSessionCookie(request);
}
