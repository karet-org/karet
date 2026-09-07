import { NextResponse } from "next/server";
import { HeadObjectCommand, PutObjectCommand } from "@aws-sdk/client-s3";
import { bucketForRelPath, withS3 } from "@/lib/config/s3-client";
import { newPipelineId } from "@/lib/config/pipeline-id";
import { listPipelinesWithNames } from "@/lib/services/config-service";
import { TEMPLATES, type TemplateId } from "@/lib/templates";
import type { PipelineConfig } from "@/lib/types/config";

export async function GET() {
  return withS3("GET /api/pipelines", async (client, config) => {
    const pipelines = await listPipelinesWithNames(client, config);
    return NextResponse.json({ pipelines });
  });
}

function absolutizeSourcePrefixes(cfg: PipelineConfig, prefix: string): PipelineConfig {
  return {
    ...cfg,
    source_containers: cfg.source_containers.map((sc) => ({
      ...sc,
      path_prefix: `${prefix}${sc.path_prefix}`,
    })),
  };
}

/**
 * Create a pipeline. `name` is the display name; the immutable id (S3
 * prefix + URL segment) is generated here and never changes — rename
 * only rewrites `name` inside pipeline.json, so name and id can drift
 * apart freely.
 */
export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as {
    name?: string;
    template?: TemplateId;
  } | null;

  const name = body?.name?.trim() ?? "";
  const template = body?.template && TEMPLATES[body.template] ? TEMPLATES[body.template] : undefined;

  if (!name) return NextResponse.json({ error: "invalid_name" }, { status: 422 });
  if (!template) return NextResponse.json({ error: "invalid_template" }, { status: 422 });

  return withS3("POST /api/pipelines", async (client, config) => {
    // Ids embed a timestamp plus 6 random base36 chars, so a collision
    // means a same-millisecond create also drew the same suffix; retry a
    // couple of times and give up loudly rather than clobber.
    let slug = "";
    for (let attempt = 0; attempt < 3; attempt++) {
      const candidate = newPipelineId();
      try {
        await client.send(
          new HeadObjectCommand({
            Bucket: config.pipelinesBucket,
            Key: `${config.pipelinesPrefix}${candidate}/pipeline.json`,
          }),
        );
        // Exists (astronomically unlikely); draw again.
      } catch {
        slug = candidate;
        break;
      }
    }
    if (!slug) {
      return NextResponse.json({ error: "id_collision" }, { status: 503 });
    }

    const prefix = `${config.pipelinesPrefix}${slug}/`;

    for (const [relPath, content] of Object.entries(template.files)) {
      // Templates author source prefixes relative to the pipeline; the
      // stored config uses absolute lake keys, so render them here. The
      // user's display name replaces the template's placeholder name.
      const body =
        relPath === "pipeline.json"
          ? { ...absolutizeSourcePrefixes(content as PipelineConfig, prefix), name }
          : content;
      await client.send(
        new PutObjectCommand({
          Bucket: bucketForRelPath(config, relPath),
          Key: `${prefix}${relPath}`,
          Body: JSON.stringify(body, null, 2),
          ContentType: "application/json",
        }),
      );
    }

    if (template.rawFiles) {
      for (const [relPath, content] of Object.entries(template.rawFiles)) {
        await client.send(
          new PutObjectCommand({
            Bucket: bucketForRelPath(config, relPath),
            Key: `${prefix}${relPath}`,
            Body: content,
            ContentType: relPath.endsWith(".csv")
              ? "text/csv"
              : "application/octet-stream",
          }),
        );
      }
    }

    return NextResponse.json({ ok: true, pipeline: slug, name });
  });
}
