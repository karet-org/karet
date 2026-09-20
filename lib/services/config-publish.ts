// What may become a config version, and what happens when it does.
//
// Three routes publish: a save, a revert and a rename. The sequence is one thing
// here, so a new one cannot skip the shape check or the validator the way the
// rename did when each route assembled it.
//
// Node runtime only.

import { refuse, type Outcome } from "@/lib/outcome";
import { validateConfigForSave } from "@/lib/graph/validateConfig";
import { saveConfig, type SaveResult } from "@/lib/services/pipeline-store";
import type { PipelineConfig } from "@/lib/types/config";

/** The fields every config must carry, checked before the deeper pass. */
export function configShapeError(value: unknown): string | null {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return "invalid_config: expected a JSON object";
  }
  const cfg = value as Record<string, unknown>;
  for (const field of ["source_containers", "dimensions", "mappings", "analytic_tables"]) {
    if (!Array.isArray(cfg[field])) return `invalid_config: ${field} must be an array`;
  }
  return null;
}

/**
 * Publish a config as the next version, or refuse it.
 *
 * Valid JSON is not a valid pipeline: `{}` parses and leaves every read failing.
 * An old version can also be invalid under today's rules, which is why a revert
 * comes through here too.
 */
export async function publishConfig(
  pipeline: string,
  candidate: unknown,
  author: { id: string | null; name: string },
  note?: string,
): Promise<Outcome<SaveResult>> {
  const shape = configShapeError(candidate);
  if (shape) return refuse("invalid_config", shape);

  const config = candidate as PipelineConfig;
  const errors = validateConfigForSave(config);
  if (errors.length > 0) {
    return refuse("invalid_config", `invalid_config: ${errors.join("; ")}`);
  }

  return { ok: true, value: await saveConfig(pipeline, config, author, note) };
}
