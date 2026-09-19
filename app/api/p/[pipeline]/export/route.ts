import { NextResponse } from "next/server";
import { GetObjectCommand } from "@aws-sdk/client-s3";
import JSZip from "jszip";
import { createS3Client, loadS3Config, wrapS3Error } from "@/lib/config/s3-client";
import { listAllObjectKeys, readBodyToBuffer } from "@/lib/services/s3-helpers";
import { withRole } from "@/lib/auth/guard";
import { getLiveConfig } from "@/lib/services/pipeline-store";

async function handleGet(
  _request: Request,
  context: { params: Promise<{ pipeline: string }> },
) {
  const { pipeline } = await context.params;
  const base = loadS3Config();
  const client = createS3Client(base);
  const prefix = `${base.pipelinesPrefix}${pipeline}/`;

  return wrapS3Error(async () => {
    const zip = new JSZip();

    // The config is in Postgres, so serialise it back into the zip. Keeping the
    // archive shaped like it always was is the point: it is how a pipeline gets
    // read, diffed and moved without the app.
    const live = await getLiveConfig(pipeline);
    if (live) zip.file("pipeline.json", JSON.stringify(live.config, null, 2));

    // Dashboards, saved queries and seeds are still objects.
    const keys = await listAllObjectKeys(client, base.pipelinesBucket, prefix);
    for (const key of keys) {
      const res = await client.send(
        new GetObjectCommand({ Bucket: base.pipelinesBucket, Key: key }),
      );
      const buffer = await readBodyToBuffer(res.Body);
      zip.file(key.slice(prefix.length), buffer);
    }

    if (!live && keys.length === 0) {
      return NextResponse.json({ error: "pipeline_not_found" }, { status: 404 });
    }

    const buf = await zip.generateAsync({ type: "arraybuffer", compression: "DEFLATE" });

    return new Response(buf, {
      status: 200,
      headers: {
        "Content-Type": "application/zip",
        "Content-Disposition": `attachment; filename="${pipeline}.zip"`,
      },
    });
  }, `GET /api/p/${pipeline}/export`);
}

export const GET = withRole(handleGet);
