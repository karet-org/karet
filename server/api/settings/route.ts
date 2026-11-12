import { createS3Client, loadS3Config, wrapS3Error } from "@/lib/config/s3-client";
import {
  getUiSettings,
  putUiSettings,
  sanitizeSettings,
} from "@/lib/services/ui-settings";
import { withRole } from "@/lib/auth/guard";

async function handleGet() {
  const cfg = loadS3Config();
  const client = createS3Client(cfg);
  return wrapS3Error(async () => {
    return Response.json(await getUiSettings(client, cfg));
  }, "GET /api/settings");
}

async function handlePut(request: Request) {
  const cfg = loadS3Config();
  const client = createS3Client(cfg);
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "invalid_json" }, { status: 400 });
  }
  const settings = sanitizeSettings(body);
  return wrapS3Error(async () => {
    await putUiSettings(client, cfg, settings);
    return Response.json(settings);
  }, "PUT /api/settings");
}

export const GET = withRole(handleGet);
export const PUT = withRole(handlePut);
