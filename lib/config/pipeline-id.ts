/**
 * Generate an opaque pipeline id: URL- and S3-safe, never shown as a
 * name, never changes. The display name lives in `pipeline.json` and can
 * drift freely without stranding the id.
 *
 * `p-<ms base36>-<rand>` mirrors the job-id scheme (`job-<ms>-<rand>`),
 * so ids also sort roughly by creation time.
 */
export function newPipelineId(): string {
  return `p-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}
