import { NextResponse } from "next/server";
import { PutObjectCommand } from "@aws-sdk/client-s3";
import JSZip from "jszip";
import { createS3Client, loadS3Config, wrapS3Error } from "@/lib/config/s3-client";
import { sanitizeSlug } from "@/lib/config/slug";

export async function POST(request: Request) {
  const base = loadS3Config();
  const client = createS3Client(base);

  // Slug comes from query param or is derived from the zip's pipeline.json
  const url = new URL(request.url);
  let slug = sanitizeSlug(url.searchParams.get("name"));

  const buf = Buffer.from(await request.arrayBuffer());
  let zip: JSZip;
  try {
    zip = await JSZip.loadAsync(buf);
  } catch {
    return NextResponse.json({ error: "invalid_zip" }, { status: 422 });
  }

  // Require pipeline.json in the zip
  if (!zip.file("pipeline.json")) {
    return NextResponse.json(
      { error: "missing_pipeline_json", message: "Zip must contain pipeline.json at the root" },
      { status: 422 },
    );
  }

  // Derive slug from filename if not provided
  if (!slug) {
    slug = `imported-${Date.now()}`;
  }

  const prefix = `${base.pipelinesPrefix}${slug}/`;

  return wrapS3Error(async () => {
    for (const [relPath, entry] of Object.entries(zip.files)) {
      if (entry.dir) continue;
      const data = await entry.async("nodebuffer");
      const key = `${prefix}${relPath}`;
      const contentType = relPath.endsWith(".json")
        ? "application/json"
        : relPath.endsWith(".png")
          ? "image/png"
          : relPath.endsWith(".parquet")
            ? "application/octet-stream"
            : "application/octet-stream";

      await client.send(
        new PutObjectCommand({
          Bucket: base.bucket,
          Key: key,
          Body: data,
          ContentType: contentType,
        }),
      );
    }

    return NextResponse.json({ ok: true, pipeline: slug });
  }, "POST /api/pipelines/import");
}
