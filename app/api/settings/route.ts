import { NextResponse } from "next/server";
import { createS3Client, loadS3Config, wrapS3Error } from "@/lib/config/s3-client";
import {
  getUiSettings,
  putUiSettings,
  sanitizeSettings,
} from "@/lib/services/ui-settings";
import { withRole } from "@/lib/auth/guard";

export const dynamic = "force-dynamic";

async function handleGet() {
  const cfg = loadS3Config();
  const client = createS3Client(cfg);
  return wrapS3Error(async () => {
    return NextResponse.json(await getUiSettings(client, cfg));
  }, "GET /api/settings");
}

async function handlePut(request: Request) {
  const cfg = loadS3Config();
  const client = createS3Client(cfg);
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }
  const settings = sanitizeSettings(body);
  return wrapS3Error(async () => {
    await putUiSettings(client, cfg, settings);
    return NextResponse.json(settings);
  }, "PUT /api/settings");
}

export const GET = withRole(handleGet);
export const PUT = withRole(handlePut);
