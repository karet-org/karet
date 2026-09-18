// Blocking pre-flight checks on a config, shared by the graph editor and the
// config write endpoint.
//
// The editor runs these so a save can't fail halfway; the endpoint runs them
// because an editor with curl is not obliged to use the editor, and a config
// that parses as JSON but not as a pipeline would otherwise be accepted and
// break every read of that pipeline. Deeper validation is the worker's job.

import type { PipelineConfig } from "@/lib/types/config";

export function validateConfigForSave(cfg: PipelineConfig): string[] {
  const errors: string[] = [];

  // Name scopes are per-kind: a Source and a Table may share a name.
  const kinds: { label: string; entities: { id: string; name?: string }[] }[] = [
    { label: "Source", entities: cfg.source_containers },
    { label: "Dimension", entities: cfg.dimensions },
    { label: "Mapping", entities: cfg.mappings },
    { label: "Table", entities: cfg.analytic_tables },
  ];
  for (const { label, entities } of kinds) {
    const seen = new Map<string, number>();
    let emptyCount = 0;
    for (const e of entities) {
      const name = e.name?.trim() ?? "";
      if (name === "") {
        emptyCount++;
        continue;
      }
      seen.set(name, (seen.get(name) ?? 0) + 1);
    }
    if (emptyCount > 0) {
      errors.push(
        `${emptyCount} ${label}${emptyCount === 1 ? "" : "s"} missing a name`,
      );
    }
    const dupes = Array.from(seen.entries())
      .filter(([, count]) => count > 1)
      .map(([name]) => name);
    if (dupes.length > 0) {
      errors.push(
        `Duplicate ${label} name${dupes.length === 1 ? "" : "s"}: ${dupes
          .sort()
          .map((n) => `"${n}"`)
          .join(", ")}`,
      );
    }
  }

  // Union: several mappings may feed one table (that is how a multi-source
  // fact table works), but two writing the same column with different types
  // produce Parquet that fails at query time.
  for (const t of cfg.analytic_tables) {
    const feeding = cfg.mappings.filter((m) => m.analytic_table_id === t.id);
    if (feeding.length < 2) continue;
    const declared = new Map(t.schema.map((c) => [c.name, c.type]));
    const seen = new Map<string, { type: string; mapping: string }>();
    for (const m of feeding) {
      for (const col of m.columns) {
        const type = declared.get(col.name);
        if (type === undefined) continue;
        const prior = seen.get(col.name);
        if (prior && prior.type !== type) {
          errors.push(
            `Table "${t.name?.trim() || t.id}": mappings "${prior.mapping}" and "${m.name || m.id}" both write "${col.name}" with different types (${prior.type} vs ${type})`,
          );
        } else if (!prior) {
          seen.set(col.name, { type, mapping: m.name || m.id });
        }
      }
    }
  }


  for (const t of cfg.analytic_tables) {
    const label = t.name?.trim() || t.id;
    const seen = new Set<string>();
    const dupes = new Set<string>();
    let emptyCount = 0;
    for (const col of t.schema) {
      const name = col.name?.trim() ?? "";
      if (name === "") {
        emptyCount++;
        continue;
      }
      if (seen.has(name)) dupes.add(name);
      seen.add(name);
    }
    if (emptyCount > 0) {
      errors.push(
        `Table "${label}": ${emptyCount} column${
          emptyCount === 1 ? "" : "s"
        } missing a name`,
      );
    }
    if (dupes.size > 0) {
      errors.push(
        `Table "${label}": duplicate column names (${Array.from(dupes)
          .sort()
          .join(", ")})`,
      );
    }
  }

  return errors;
}
