// Validation for pipeline-import zip entries.
//
// Entry paths become S3 keys under pipelines/<slug>/ and their extension
// picks the destination bucket, so they must be plain relative paths.

export const MAX_ZIP_BYTES = 200 * 1024 * 1024;
export const MAX_ENTRIES = 2_000;
export const MAX_TOTAL_UNCOMPRESSED = 1024 * 1024 * 1024;

const SEGMENT = /^[A-Za-z0-9][A-Za-z0-9._ -]*$/;

/** True when a zip entry path is safe to use as a key suffix. */
export function isSafeEntryPath(relPath: string): boolean {
  if (relPath.length === 0 || relPath.length > 512) return false;
  if (relPath.includes("\\") || relPath.startsWith("/")) return false;
  const segments = relPath.split("/");
  return segments.every((seg) => SEGMENT.test(seg) && seg !== "." && seg !== "..");
}
