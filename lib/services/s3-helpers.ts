// Small helpers around the AWS SDK v3 S3 client.

import {
  ListObjectsV2Command,
  type ListObjectsV2CommandOutput,
  type S3Client,
} from "@aws-sdk/client-s3";

export interface ListedObject {
  key: string;
  /** ISO write time from the listing. */
  lastModified?: string;
}

/** Every object under `prefix`, walking continuation tokens so the list is complete. */
export async function listAllObjects(
  client: S3Client,
  bucket: string,
  prefix: string,
): Promise<ListedObject[]> {
  const objects: ListedObject[] = [];
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
      if (obj.Key) {
        objects.push({ key: obj.Key, lastModified: obj.LastModified?.toISOString() });
      }
    }
    token = res.NextContinuationToken;
  } while (token);
  return objects;
}

/** Every object key under `prefix`. */
export async function listAllObjectKeys(
  client: S3Client,
  bucket: string,
  prefix: string,
): Promise<string[]> {
  return (await listAllObjects(client, bucket, prefix)).map((o) => o.key);
}

/** Drain an `AsyncIterable<Uint8Array>` (the SDK v3 `Body` shape on Node) into a Buffer. */
export async function readBodyToBuffer(body: unknown): Promise<Buffer> {
  const chunks: Uint8Array[] = [];
  const stream = body as AsyncIterable<Uint8Array>;
  for await (const chunk of stream) chunks.push(chunk);
  return Buffer.concat(chunks);
}
