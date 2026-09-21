import { NextResponse } from "next/server";
import { PutObjectCommand } from "@aws-sdk/client-s3";
import JSZip from "jszip";
import { bucketForRelPath, createS3Client, loadS3Config, wrapS3Error } from "@/lib/config/s3-client";
import { newId } from "@/lib/config/id";
import {
  isSafeEntryPath,
  MAX_ENTRIES,
  MAX_TOTAL_UNCOMPRESSED,
  MAX_ZIP_BYTES,
} from "@/lib/services/import-validation";
import { withRole } from "@/lib/auth/guard";
import type { Principal } from "@/lib/auth/service-token";
import { createPipeline } from "@/lib/services/pipeline-store";
import { normalizePipelineConfig } from "@/lib/config/migrate";

async function handlePost(request: Request, _context: unknown, principal: Principal) {
  const base = loadS3Config();
  const client = createS3Client(base);

  // `?name=` only seeds the display name when the zip's pipeline.json
  // doesn't carry one; the id itself is always freshly generated.
  const url = new URL(request.url);
  const fallbackName = url.searchParams.get("name")?.trim() ?? "";

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

  const slug = newId("p");

  const prefix = `${base.pipelinesPrefix}${slug}/`;

  return wrapS3Error(async () => {
    let totalBytes = 0;
    for (const [relPath, entry] of entries) {
      const data = await entry.async("nodebuffer");
      totalBytes += data.length;
      if (totalBytes > MAX_TOTAL_UNCOMPRESSED) {
        return NextResponse.json({ error: "zip_expands_too_large" }, { status: 413 });
      }
      // The config becomes the pipeline's first version in Postgres rather than
      // an object. Older exports carry no `name`; seed one so the pipeline never
      // renders as its opaque id.
      if (relPath === "pipeline.json") {
        try {
          const cfg = normalizePipelineConfig(JSON.parse(data.toString("utf-8")));
          if (!cfg.name?.trim()) {
            cfg.name = fallbackName || `Imported ${new Date().toISOString().slice(0, 10)}`;
          }
          await createPipeline(slug, cfg, {
            id: principal.userId,
            name: principal.username,
          });
        } catch (err) {
          return NextResponse.json(
            {
              error: "invalid_pipeline_json",
              message: `pipeline.json could not be imported: ${(err as Error).message}`,
            },
            { status: 422 },
          );
        }
        continue;
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

export const POST = withRole(handlePost);
