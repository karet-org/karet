// Small helpers around the AWS SDK v3 S3 client.

import {
  ListObjectsV2Command,
  type ListObjectsV2CommandOutput,
  type S3Client,
} from "@aws-sdk/client-s3";

/** Every object key under `prefix`, walking continuation tokens so the list is complete. */
export async function listAllObjectKeys(
  client: S3Client,
  bucket: string,
  prefix: string,
): Promise<string[]> {
  const keys: string[] = [];
  let token: string | undefined;
  do {
    const res: ListObjectsV2CommandOutput = await client.send(
      new ListObjectsV2Command({
        Bucket: bucket,
        Prefix: prefix,
        ContinuationToken: token,
      }),
    );
    for (const obj of res.Contents ?? []) {
      if (obj.Key) keys.push(obj.Key);
    }
    token = res.NextContinuationToken;
  } while (token);
  return keys;
}

/** Drain an `AsyncIterable<Uint8Array>` (the SDK v3 `Body` shape on Node) into a Buffer. */
export async function readBodyToBuffer(body: unknown): Promise<Buffer> {
  const chunks: Uint8Array[] = [];
  const stream = body as AsyncIterable<Uint8Array>;
  for await (const chunk of stream) chunks.push(chunk);
  return Buffer.concat(chunks);
}
