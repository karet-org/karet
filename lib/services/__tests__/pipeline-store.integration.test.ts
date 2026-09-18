// The config store, against a real Postgres.
//
// This replaces the S3 save round-trip property test. The property still matters
// and the risk actually went up: `jsonb` does not preserve key order and
// normalises numbers, so a config could come back subtly different from what was
// saved. Only a real database can show that, so these run when DATABASE_URL is
// set and skip otherwise.
//
//   DATABASE_URL=postgres://karet:…@localhost:5432/karet npx vitest --run pipeline-store

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import fc from "fast-check";
import type { PipelineConfig } from "@/lib/types/config";

const HAS_DB = Boolean(process.env.DATABASE_URL);
const suite = HAS_DB ? describe : describe.skip;

const SLUG = "test-store-fixture";

function config(overrides: Partial<PipelineConfig> = {}): PipelineConfig {
  return {
    version: 1,
    name: "Fixture",
    source_containers: [
      { id: "raw", name: "Raw", path_prefix: "lake/raw/", schema: [{ name: "a", type: "string" }] },
    ],
    dimensions: [],
    mappings: [
      {
        id: "m1",
        name: "Mapping",
        source_container_id: "raw",
        analytic_table_id: "t1",
        columns: [{ name: "a", expr: { kind: "col", name: "a" } }],
      },
    ],
    analytic_tables: [{ id: "t1", name: "Table", schema: [{ name: "a", type: "string" }] }],
    layout: {},
    ...overrides,
  } as PipelineConfig;
}

suite("pipeline store", () => {
  let store: typeof import("../pipeline-store");
  let db: typeof import("@/lib/db");

  beforeAll(async () => {
    store = await import("../pipeline-store");
    db = await import("@/lib/db");
    await db.query(`DELETE FROM pipelines WHERE slug = $1`, [SLUG]);
  });

  afterAll(async () => {
    if (!HAS_DB) return;
    await db.query(`DELETE FROM pipelines WHERE slug = $1`, [SLUG]);
  });

  it("registers a pipeline with its first version live", async () => {
    const saved = await store.createPipeline(SLUG, config(), { id: null, name: "tester" });
    expect(saved.version).toBe(1);
    const live = await store.getLiveConfig(SLUG);
    expect(live?.version).toBe(1);
    expect(live?.authorName).toBe("tester");
    expect(live?.note).toBe("created");
  });

  it("increments versions and moves the pointer", async () => {
    const second = await store.saveConfig(SLUG, config({ name: "Renamed" }), {
      id: null,
      name: "tester",
    });
    expect(second.version).toBe(2);
    const live = await store.getLiveConfig(SLUG);
    expect(live?.version).toBe(2);
    expect(live?.config.name).toBe("Renamed");
    // The earlier version is still readable: history is append-only.
    expect((await store.getVersion(SLUG, 1))?.config.name).toBe("Fixture");
  });

  it("lists versions newest first and marks exactly one live", async () => {
    const versions = await store.listVersions(SLUG);
    expect(versions.map((v) => v.version)).toEqual([2, 1]);
    expect(versions.filter((v) => v.live)).toHaveLength(1);
    expect(versions.find((v) => v.live)?.version).toBe(2);
  });

  it("round-trips a config through jsonb unchanged", async () => {
    // The risk this covers: jsonb reorders object keys and can renormalise
    // numbers, either of which would quietly change a stored pipeline.
    await fc.assert(
      fc.asyncProperty(
        fc.record({
          name: fc.string({ minLength: 1, maxLength: 40 }),
          tableId: fc.stringMatching(/^[a-z][a-z0-9_]{0,20}$/),
          columnName: fc.stringMatching(/^[a-z][a-z0-9_]{0,20}$/),
          factor: fc.double({ min: -1e6, max: 1e6, noNaN: true, noDefaultInfinity: true }),
        }),
        async ({ name, tableId, columnName, factor }) => {
          const original = config({
            name,
            analytic_tables: [
              { id: tableId, name: "T", schema: [{ name: columnName, type: "float64" }] },
            ],
            mappings: [
              {
                id: "m1",
                name: "Mapping",
                source_container_id: "raw",
                analytic_table_id: tableId,
                columns: [
                  {
                    name: columnName,
                    expr: {
                      kind: "mul",
                      left: { kind: "col", name: "a" },
                      right: { kind: "num", value: factor },
                    },
                  },
                ],
              },
            ],
          } as Partial<PipelineConfig>);
          const saved = await store.saveConfig(SLUG, original, { id: null, name: "prop" });
          const read = await store.getVersion(SLUG, saved.version);
          expect(read?.config).toEqual(original);
        },
      ),
      { numRuns: 12 },
    );
  });

  it("rejects a version number that already exists", async () => {
    // The unique constraint is what makes two racing saves safe: one wins and
    // the other fails loudly rather than overwriting.
    const live = await store.getLiveConfig(SLUG);
    await expect(
      db.query(
        `INSERT INTO config_versions (pipeline, version, config, author_name)
         VALUES ($1, $2, '{}'::jsonb, 'racer')`,
        [SLUG, live!.version],
      ),
    ).rejects.toThrow();
  });

  it("cascades versions when a pipeline is deleted", async () => {
    await store.deletePipeline(SLUG);
    expect(await store.getLiveConfig(SLUG)).toBeNull();
    expect(await store.listVersions(SLUG)).toEqual([]);
  });
});
