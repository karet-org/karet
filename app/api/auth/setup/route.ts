// First-run admin setup. Refuses if an admin password already exists, so
// this endpoint is effectively single-shot.

import { NextResponse } from "next/server";
import { withS3 } from "@/lib/config/s3-client";
import { createInitialAdmin, hasAdmin } from "@/lib/auth/users";
import { issueSessionCookie } from "@/lib/auth/session";

export const runtime = "nodejs";

export async function GET() {
  return withS3("GET /api/auth/setup", async (client, cfg) => {
    return NextResponse.json({ needsSetup: !(await hasAdmin(client, cfg.pipelinesBucket)) });
  });
}

export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as {
    password?: string;
  } | null;
  const password = body?.password;
  if (!password || password.length < 8) {
    return NextResponse.json(
      { error: "invalid_password", message: "Password must be at least 8 characters" },
      { status: 422 },
    );
  }

  return withS3("POST /api/auth/setup", async (client, cfg) => {
    const result = await createInitialAdmin(client, cfg.pipelinesBucket, password);
    if (!result.created) {
      return NextResponse.json(
        { error: "already_initialized" },
        { status: 409 },
      );
    }
    return issueSessionCookie(request);
  });
}
