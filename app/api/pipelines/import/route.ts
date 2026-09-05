import { NextResponse } from "next/server";
import { PutObjectCommand } from "@aws-sdk/client-s3";
import JSZip from "jszip";
import { bucketForRelPath, createS3Client, loadS3Config, wrapS3Error } from "@/lib/config/s3-client";
import { sanitizeSlug } from "@/lib/config/slug";
import {
  isSafeEntryPath,
  MAX_ENTRIES,
  MAX_TOTAL_UNCOMPRESSED,
  MAX_ZIP_BYTES,
} from "@/lib/services/import-validation";

export async function POST(request: Request) {
  const base = loadS3Config();
  const client = createS3Client(base);

  // Slug comes from query param or is derived from the zip's pipeline.json
  const url = new URL(request.url);
  let slug = sanitizeSlug(url.searchParams.get("name"));

  const declared = Number(request.headers.get("content-length"));
  if (declared > MAX_ZIP_BYTES) {
    return NextResponse.json({ error: "zip_too_large" }, { status: 413 });
  }
  const buf = Buffer.from(await request.arrayBuffer());
  if (buf.length > MAX_ZIP_BYTES) {
    return NextResponse.json({ error: "zip_too_large" }, { status: 413 });
  }
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

  // Validate every entry before writing anything: paths become S3 keys,
  // and totals bound decompression (zip-bomb) cost.
  const entries = Object.entries(zip.files).filter(([, e]) => !e.dir);
  if (entries.length > MAX_ENTRIES) {
    return NextResponse.json({ error: "too_many_entries" }, { status: 422 });
  }
  for (const [relPath] of entries) {
    if (!isSafeEntryPath(relPath)) {
      return NextResponse.json(
        { error: "invalid_entry_path", message: `Unsafe zip entry: ${relPath}` },
        { status: 422 },
      );
    }
  }

  // Derive slug from filename if not provided
  if (!slug) {
    slug = `imported-${Date.now()}`;
  }

  const prefix = `${base.pipelinesPrefix}${slug}/`;

  return wrapS3Error(async () => {
    let totalBytes = 0;
    for (const [relPath, entry] of entries) {
      const data = await entry.async("nodebuffer");
      totalBytes += data.length;
      if (totalBytes > MAX_TOTAL_UNCOMPRESSED) {
        return NextResponse.json({ error: "zip_expands_too_large" }, { status: 413 });
      }
      const key = `${prefix}${relPath}`;
      const contentType = relPath.endsWith(".json")
        ? "application/json"
        : relPath.endsWith(".png")
          ? "image/png"
          : "application/octet-stream";

      await client.send(
        new PutObjectCommand({
          Bucket: bucketForRelPath(base, relPath),
          Key: key,
          Body: data,
          ContentType: contentType,
        }),
      );
    }

    return NextResponse.json({ ok: true, pipeline: slug });
  }, "POST /api/pipelines/import");
}
