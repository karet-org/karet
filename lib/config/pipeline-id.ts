/**
 * Opaque, immutable pipeline id; the display name lives in `pipeline.json` and
 * can drift freely. `p-<ms base36>-<rand>` mirrors the job-id scheme, so ids
 * also sort roughly by creation time.
 */
export function newPipelineId(): string {
  return `p-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}
