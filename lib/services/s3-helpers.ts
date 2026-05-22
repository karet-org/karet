// Small helpers around the AWS SDK v3 S3 client.

import {
  ListObjectsV2Command,
  type ListObjectsV2CommandOutput,
  type S3Client,
} from "@aws-sdk/client-s3";

/**
 * List every object key under `prefix` in `bucket`, walking continuation
 * tokens so the result is complete. Callers that only want a subset
 * (e.g. a particular extension) should filter the returned list --
 * there's no point offering a predicate since the pagination cost is in
 * the S3 round trips, not the client-side filter.
 */
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

/**
 * Drain an `AsyncIterable<Uint8Array>` (the AWS SDK v3 `Body` shape on
 * Node.js) into a single `Buffer`.
 */
export async function readBodyToBuffer(body: unknown): Promise<Buffer> {
  const chunks: Uint8Array[] = [];
  const stream = body as AsyncIterable<Uint8Array>;
  for await (const chunk of stream) chunks.push(chunk);
  return Buffer.concat(chunks);
}
