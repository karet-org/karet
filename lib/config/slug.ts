/**
 * Canonicalize a user-entered pipeline name into a URL/S3-safe slug:
 * lowercased, non-[a-z0-9-] characters replaced with `-`, and leading /
 * trailing dashes trimmed. Returns `""` when the input has no legal
 * characters, which callers should treat as "invalid input".
 *
 * Single source of truth — every call site (create pipeline, rename,
 * import, delete, display hint) must go through this to stay consistent.
 */
export function sanitizeSlug(raw: string | null | undefined): string {
  if (!raw) return "";
  return raw
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, "-")
    .replace(/^-+|-+$/g, "");
}
