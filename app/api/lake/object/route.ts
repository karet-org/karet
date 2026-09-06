import { NextResponse } from "next/server";
import { GetObjectCommand } from "@aws-sdk/client-s3";
import { createS3Client, loadS3Config, wrapS3Error } from "@/lib/config/s3-client";

const KEY_RE = /^[A-Za-z0-9][A-Za-z0-9._/ -]*$/;

/** Downloads a lake object as an attachment. */
export async function GET(request: Request) {
  const cfg = loadS3Config();
  const client = createS3Client(cfg);
  const key = new URL(request.url).searchParams.get("key") ?? "";
  if (!KEY_RE.test(key) || key.includes("..") || key.endsWith("/")) {
    return NextResponse.json({ error: "invalid_key" }, { status: 422 });
  }

  return wrapS3Error(async () => {
    const res = await client.send(
      new GetObjectCommand({ Bucket: cfg.lakeBucket, Key: key }),
    );
    const filename = key.split("/").pop() ?? "file";
    return new Response(res.Body as ReadableStream, {
      headers: {
        "Content-Type": res.ContentType ?? "application/octet-stream",
        "Content-Disposition": `attachment; filename="${filename.replace(/"/g, "")}"`,
        ...(res.ContentLength ? { "Content-Length": String(res.ContentLength) } : {}),
      },
    });
  }, "GET /api/lake/object");
}
