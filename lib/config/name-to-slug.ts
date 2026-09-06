/** Display name to a SQL-safe identifier (matches the query endpoint). */
export function nameToSlug(name: string): string {
  const cleaned = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
  return cleaned || "_x";
}
