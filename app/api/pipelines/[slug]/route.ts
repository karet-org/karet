import { NextResponse } from "next/server";
import { DeleteObjectsCommand, type ObjectIdentifier } from "@aws-sdk/client-s3";
import { createS3Client, loadS3Config, wrapS3Error } from "@/lib/config/s3-client";
import { sanitizeSlug } from "@/lib/config/slug";
import {
  renamePipelinePrefix,
  SourceNotFoundError,
  TargetExistsError,
} from "@/lib/services/config-service";
import { listAllObjectKeys } from "@/lib/services/s3-helpers";

/**
 * Delete a pipeline by slug -- removes every object under
 * `pipelines/<slug>/`. Backs the "Delete pipeline" button in TopNav.
 */
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
    const keys = await listAllObjectKeys(client, config.bucket, prefix);
    if (keys.length === 0) {
      return NextResponse.json(
        { error: "not_found", pipeline: safeSlug },
        { status: 404 },
      );
    }

    // DeleteObjectsCommand accepts up to 1000 keys per call.
    const toDelete: ObjectIdentifier[] = keys.map((Key) => ({ Key }));
    for (let i = 0; i < toDelete.length; i += 1000) {
      const chunk = toDelete.slice(i, i + 1000);
      await client.send(
        new DeleteObjectsCommand({
          Bucket: config.bucket,
          Delete: { Objects: chunk, Quiet: true },
        }),
      );
    }

    return NextResponse.json({ ok: true, pipeline: safeSlug, deleted: keys.length });
  }, `DELETE /api/pipelines/${safeSlug}`);
}

/**
 * Rename a pipeline slug. Copies every object under `pipelines/<slug>/`
 * to `pipelines/<newSlug>/` then deletes the originals. External links
 * to the old slug break by design.
 *
 * 4xx cases:
 *   - 422 invalid_slug   : either slug is empty after sanitization
 *   - 422 unchanged      : new slug equals old slug
 *   - 404 not_found      : no objects exist under the old prefix
 *   - 409 already_exists : new slug already has a `pipeline.json`
 */
export async function PATCH(
  request: Request,
  context: { params: Promise<{ slug: string }> },
) {
  const { slug } = await context.params;
  const safeFrom = sanitizeSlug(slug);
  if (!safeFrom) {
    return NextResponse.json({ error: "invalid_slug" }, { status: 422 });
  }

  const body = (await request.json().catch(() => null)) as
    | { newSlug?: string }
    | null;
  const safeTo = sanitizeSlug(body?.newSlug);
  if (!safeTo) {
    return NextResponse.json({ error: "invalid_slug" }, { status: 422 });
  }
  if (safeTo === safeFrom) {
    return NextResponse.json(
      { error: "unchanged", message: "new slug equals old slug" },
      { status: 422 },
    );
  }

  const config = loadS3Config();
  const client = createS3Client(config);

  return wrapS3Error(async () => {
    try {
      const moved = await renamePipelinePrefix(
        client,
        config.bucket,
        config.pipelinesPrefix,
        safeFrom,
        safeTo,
      );
      return NextResponse.json({ ok: true, from: safeFrom, to: safeTo, moved });
    } catch (err) {
      if (err instanceof SourceNotFoundError) {
        return NextResponse.json(
          { error: "not_found", pipeline: safeFrom },
          { status: 404 },
        );
      }
      if (err instanceof TargetExistsError) {
        return NextResponse.json(
          { error: "already_exists", pipeline: safeTo },
          { status: 409 },
        );
      }
      throw err;
    }
  }, `PATCH /api/pipelines/${safeFrom}`);
}
