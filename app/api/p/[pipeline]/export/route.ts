import { NextResponse } from "next/server";
import { GetObjectCommand } from "@aws-sdk/client-s3";
import JSZip from "jszip";
import { createS3Client, loadS3Config, wrapS3Error } from "@/lib/config/s3-client";
import { listAllObjectKeys, readBodyToBuffer } from "@/lib/services/s3-helpers";

export async function GET(
  _request: Request,
  context: { params: Promise<{ pipeline: string }> },
) {
  const { pipeline } = await context.params;
  const base = loadS3Config();
  const client = createS3Client(base);
  const prefix = `${base.pipelinesPrefix}${pipeline}/`;

  return wrapS3Error(async () => {
    const zip = new JSZip();

    // Collect objects from the pipelines buckets.
    const keys = await listAllObjectKeys(client, base.pipelinesBucket, prefix);
    for (const key of keys) {
      const res = await client.send(
        new GetObjectCommand({ Bucket: base.pipelinesBucket, Key: key }),
      );
      const buffer = await readBodyToBuffer(res.Body);
      zip.file(key.slice(prefix.length), buffer);
    }

    if (keys.length === 0) {
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
