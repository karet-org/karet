import { NextResponse } from "next/server";
import { withS3 } from "@/lib/config/s3-client";
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

  return withS3("POST /api/auth/login", async (client, cfg) => {
    const ok = await verifyAdminPassword(client, cfg.pipelinesBucket, password);
    if (!ok) {
      return NextResponse.json(
        { error: "invalid_credentials" },
        { status: 401 },
      );
    }
    return issueSessionCookie(request);
  });
}
