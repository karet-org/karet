/** `<prefix>-<base36 ms>-<rand6>`. Opaque: never parsed, ordering comes from record data. */
export function newId(prefix: string): string {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}
