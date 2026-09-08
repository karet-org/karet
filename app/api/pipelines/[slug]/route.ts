import { NextResponse } from "next/server";
import { DeleteObjectsCommand, type ObjectIdentifier } from "@aws-sdk/client-s3";
import {
  createS3Client,
  loadS3Config,
  pipelineS3Config,
  wrapS3Error,
} from "@/lib/config/s3-client";
import { sanitizeSlug } from "@/lib/config/slug";
import {
  getPipelineConfig,
  putPipelineConfig,
} from "@/lib/services/config-service";
import { listAllObjectKeys } from "@/lib/services/s3-helpers";

/** Removes every object under `pipelines/<slug>/` in the pipelines and warehouse bucket. */
export async function DELETE(
  _request: Request,
  context: { params: Promise<{ slug: string }> },
) {
  const { slug } = await context.params;
  const safeSlug = sanitizeSlug(slug);
  if (!safeSlug) {
    return NextResponse.json({ error: "invalid_slug" }, { status: 422 });
  }

  const config = loadS3Config();
  const client = createS3Client(config);
  const prefix = `${config.pipelinesPrefix}${safeSlug}/`;

  return wrapS3Error(async () => {
    let totalDeleted = 0;

    for (const bucket of [config.pipelinesBucket, config.warehouseBucket]) {
      const keys = await listAllObjectKeys(client, bucket, prefix);
      if (keys.length === 0) continue;
      const toDelete: ObjectIdentifier[] = keys.map((Key) => ({ Key }));
      for (let i = 0; i < toDelete.length; i += 1000) {
        const chunk = toDelete.slice(i, i + 1000);
        await client.send(
          new DeleteObjectsCommand({
            Bucket: bucket,
            Delete: { Objects: chunk, Quiet: true },
          }),
        );
      }
      totalDeleted += keys.length;
    }

    if (totalDeleted === 0) {
      return NextResponse.json(
        { error: "not_found", pipeline: safeSlug },
        { status: 404 },
      );
    }

    return NextResponse.json({ ok: true, pipeline: safeSlug, deleted: totalDeleted });
  }, `DELETE /api/pipelines/${safeSlug}`);
}

/** Renames the display name only; the id is immutable, so no objects move. */
export async function PATCH(
  request: Request,
  context: { params: Promise<{ slug: string }> },
) {
  const { slug } = await context.params;
  const safeSlug = sanitizeSlug(slug);
  if (!safeSlug) {
    return NextResponse.json({ error: "invalid_slug" }, { status: 422 });
  }

  const body = (await request.json().catch(() => null)) as
    | { name?: string }
    | null;
  const name = body?.name?.trim() ?? "";
  if (!name) {
    return NextResponse.json({ error: "invalid_name" }, { status: 422 });
  }

  const config = pipelineS3Config(loadS3Config(), safeSlug);
  const client = createS3Client(config);

  return wrapS3Error(async () => {
    const current = await getPipelineConfig(client, config);
    if (!current) {
      return NextResponse.json(
        { error: "not_found", pipeline: safeSlug },
        { status: 404 },
      );
    }
    const updated = { ...current.config, name };
    await putPipelineConfig(client, config, JSON.stringify(updated, null, 2));
    return NextResponse.json({ ok: true, pipeline: safeSlug, name });
  }, `PATCH /api/pipelines/${safeSlug}`);
}
