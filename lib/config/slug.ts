/**
 * Canonicalize a name into a URL/S3-safe slug; `""` means invalid input. Single
 * source of truth — every call site must use it to stay consistent.
 */
export function sanitizeSlug(raw: string | null | undefined): string {
  if (!raw) return "";
  return raw
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, "-")
    .replace(/^-+|-+$/g, "");
}
