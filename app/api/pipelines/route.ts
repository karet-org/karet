import { NextResponse } from "next/server";
import { HeadObjectCommand, PutObjectCommand } from "@aws-sdk/client-s3";
import { bucketForRelPath, withS3 } from "@/lib/config/s3-client";
import { sanitizeSlug } from "@/lib/config/slug";
import { listPipelines } from "@/lib/services/config-service";
import { TEMPLATES, type TemplateId } from "@/lib/templates";

export async function GET() {
  return withS3("GET /api/pipelines", async (client, config) => {
    const pipelines = await listPipelines(client, config);
    return NextResponse.json({ pipelines });
  });
}

export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as {
    slug?: string;
    template?: TemplateId;
  } | null;

  const slug = sanitizeSlug(body?.slug);
  const template = body?.template && TEMPLATES[body.template] ? TEMPLATES[body.template] : undefined;

  if (!slug) return NextResponse.json({ error: "invalid_slug" }, { status: 422 });
  if (!template) return NextResponse.json({ error: "invalid_template" }, { status: 422 });

  return withS3("POST /api/pipelines", async (client, config) => {
    const prefix = `${config.pipelinesPrefix}${slug}/`;
    const pipelineKey = `${prefix}pipeline.json`;

    // Reject if a pipeline.json already exists at this slug
    try {
      await client.send(new HeadObjectCommand({ Bucket: config.pipelinesBucket, Key: pipelineKey }));
      return NextResponse.json({ error: "already_exists", pipeline: slug }, { status: 409 });
    } catch {
      // not found, ok to create
    }

    for (const [relPath, content] of Object.entries(template.files)) {
      await client.send(
        new PutObjectCommand({
          Bucket: bucketForRelPath(config, relPath),
          Key: `${prefix}${relPath}`,
          Body: JSON.stringify(content, null, 2),
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

    return NextResponse.json({ ok: true, pipeline: slug });
  });
}
