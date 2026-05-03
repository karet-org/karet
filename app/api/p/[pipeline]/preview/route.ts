import { NextResponse } from "next/server";
import {
  GetObjectCommand,
  HeadObjectCommand,
  PutObjectCommand,
} from "@aws-sdk/client-s3";
import { createS3Client, loadS3Config } from "@/lib/config/s3-client";
import { readBodyToBuffer } from "@/lib/services/s3-helpers";

function previewKey(pipeline: string): string {
  const base = loadS3Config();
  return `${base.pipelinesPrefix}${pipeline}/preview.png`;
}

/** 1x1 transparent PNG used as the fallback when no preview exists. */
const TRANSPARENT_PIXEL = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAAC0lEQVQI12NgAAIABQAB" +
    "Nl7BcQAAAABJRU5ErkJggg==",
  "base64",
);

export async function GET(
  _request: Request,
  context: { params: Promise<{ pipeline: string }> },
) {
  const { pipeline } = await context.params;
  const config = loadS3Config();
  const client = createS3Client(config);

  try {
    const res = await client.send(
      new GetObjectCommand({ Bucket: config.bucket, Key: previewKey(pipeline) }),
    );
    const buffer = await readBodyToBuffer(res.Body);
    return new NextResponse(new Uint8Array(buffer), {
      status: 200,
      headers: {
        "Content-Type": "image/png",
        "Cache-Control": "public, max-age=60",
      },
    });
  } catch {
    return new NextResponse(new Uint8Array(TRANSPARENT_PIXEL), {
      status: 200,
      headers: {
        "Content-Type": "image/png",
        "Cache-Control": "public, max-age=10",
      },
    });
  }
}

export async function PUT(
  request: Request,
  context: { params: Promise<{ pipeline: string }> },
) {
  const { pipeline } = await context.params;
  const config = loadS3Config();
  const client = createS3Client(config);

  const body = Buffer.from(await request.arrayBuffer());
  await client.send(
    new PutObjectCommand({
      Bucket: config.bucket,
      Key: previewKey(pipeline),
      Body: body,
      ContentType: "image/png",
    }),
  );
  return NextResponse.json({ ok: true });
}

/**
 * HEAD — 200 if a real preview exists, 404 otherwise. The graph page uses
 * this to decide whether to auto-capture a thumbnail on first visit;
 * GET always returns 200 (real PNG or placeholder) so <img> tags don't
 * break.
 */
export async function HEAD(
  _request: Request,
  context: { params: Promise<{ pipeline: string }> },
) {
  const { pipeline } = await context.params;
  const config = loadS3Config();
  const client = createS3Client(config);

  try {
    await client.send(
      new HeadObjectCommand({ Bucket: config.bucket, Key: previewKey(pipeline) }),
    );
    return new NextResponse(null, { status: 200 });
  } catch {
    return new NextResponse(null, { status: 404 });
  }
}
