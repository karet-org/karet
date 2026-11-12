import { createS3Client, loadS3Config, wrapS3Error } from "@/lib/config/s3-client";
import { getUiSettings, starredListings } from "@/lib/services/ui-settings";
import { withRole } from "@/lib/auth/guard";

/** The starred pipelines with their names, for the landing rail. */
async function handleGet() {
  const cfg = loadS3Config();
  return wrapS3Error(async () => {
    const settings = await getUiSettings(createS3Client(cfg), cfg);
    return Response.json({ starred: await starredListings(settings.starred) });
  }, "GET /api/settings/starred");
}

export const GET = withRole(handleGet);
