import { NextResponse } from "next/server";
import {
  CopyObjectCommand,
  DeleteObjectCommand,
  ListObjectsV2Command,
  PutObjectCommand,
} from "@aws-sdk/client-s3";
import { createS3Client, loadS3Config, wrapS3Error } from "@/lib/config/s3-client";

const MAX_UPLOAD_BYTES = 100 * 1024 * 1024;
const KEY_RE = /^[A-Za-z0-9][A-Za-z0-9._/ -]*$/;

function validPrefix(p: string): boolean {
  if (p === "") return true;
  return KEY_RE.test(p) && !p.includes("..") && !p.startsWith("/") && p.endsWith("/");
}

/** Lists one level of the lake bucket under `?prefix=`. */
export async function GET(request: Request) {
  const cfg = loadS3Config();
  const client = createS3Client(cfg);
  const prefix = new URL(request.url).searchParams.get("prefix") ?? "";
  if (!validPrefix(prefix)) {
    return NextResponse.json({ error: "invalid_prefix" }, { status: 422 });
  }

  return wrapS3Error(async () => {
    const res = await client.send(
      new ListObjectsV2Command({
        Bucket: cfg.lakeBucket,
        Prefix: prefix,
        Delimiter: "/",
        MaxKeys: 500,
      }),
    );
    const folders = (res.CommonPrefixes ?? [])
      .map((c) => c.Prefix ?? "")
      .filter(Boolean);
    const files = (res.Contents ?? [])
      .filter((o) => o.Key && o.Key !== prefix)
      .map((o) => ({
        key: o.Key!,
        size: o.Size ?? 0,
        lastModified: o.LastModified?.toISOString() ?? null,
      }));
    return NextResponse.json({ prefix, folders, files, truncated: !!res.IsTruncated });
  }, "GET /api/lake");
}

/** Uploads one file to the lake bucket at `?key=`. */
export async function PUT(request: Request) {
  const cfg = loadS3Config();
  const client = createS3Client(cfg);
  const key = new URL(request.url).searchParams.get("key") ?? "";
  if (!KEY_RE.test(key) || key.includes("..") || key.endsWith("/")) {
    return NextResponse.json({ error: "invalid_key" }, { status: 422 });
  }
  const declared = Number(request.headers.get("content-length"));
  if (declared > MAX_UPLOAD_BYTES) {
    return NextResponse.json({ error: "too_large" }, { status: 413 });
  }
  const body = Buffer.from(await request.arrayBuffer());
  if (body.length > MAX_UPLOAD_BYTES) {
    return NextResponse.json({ error: "too_large" }, { status: 413 });
  }

  return wrapS3Error(async () => {
    await client.send(
      new PutObjectCommand({
        Bucket: cfg.lakeBucket,
        Key: key,
        Body: body,
        ContentType: key.endsWith(".csv") ? "text/csv" : "application/octet-stream",
      }),
    );
    return NextResponse.json({ ok: true, key });
  }, "PUT /api/lake");
}

export async function DELETE(request: Request) {
  const cfg = loadS3Config();
  const client = createS3Client(cfg);
  const key = new URL(request.url).searchParams.get("key") ?? "";
  if (!KEY_RE.test(key) || key.includes("..") || key.endsWith("/")) {
    return NextResponse.json({ error: "invalid_key" }, { status: 422 });
  }
  return wrapS3Error(async () => {
    await client.send(new DeleteObjectCommand({ Bucket: cfg.lakeBucket, Key: key }));
    return NextResponse.json({ ok: true });
  }, "DELETE /api/lake");
}

/** Renames an object: copy to the new key, delete the old one. */
export async function POST(request: Request) {
  const cfg = loadS3Config();
  const client = createS3Client(cfg);
  const body = (await request.json().catch(() => ({}))) as { from?: string; to?: string };
  const { from, to } = body;
  const bad = (k?: string) => !k || !KEY_RE.test(k) || k.includes("..") || k.endsWith("/");
  if (bad(from) || bad(to)) {
    return NextResponse.json({ error: "invalid_key" }, { status: 422 });
  }
  if (from === to) return NextResponse.json({ ok: true });
  return wrapS3Error(async () => {
    await client.send(
      new CopyObjectCommand({
        Bucket: cfg.lakeBucket,
        CopySource: `${cfg.lakeBucket}/${encodeURIComponent(from!).replace(/%2F/g, "/")}`,
        Key: to!,
      }),
    );
    await client.send(new DeleteObjectCommand({ Bucket: cfg.lakeBucket, Key: from! }));
    return NextResponse.json({ ok: true, key: to });
  }, "POST /api/lake (rename)");
}
