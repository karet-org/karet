// What may become a config version.
//
// The three routes that publish, a save, a revert and a rename, each used to
// re-assemble this. The rename assembled none of it, so a rename could write a
// config that a save of the same bytes would have refused.

import { describe, expect, it, vi } from "vitest";

const saved: { pipeline: string; note?: string }[] = [];

vi.mock("@/lib/services/pipeline-store", () => ({
  saveConfig: async (pipeline: string, _config: unknown, _author: unknown, note?: string) => {
    saved.push({ pipeline, note });
    return { versionId: saved.length, version: saved.length };
  },
}));

const { configShapeError, publishConfig } = await import("../config-publish");

const author = { id: null, name: "tester" };

function valid() {
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
  };
}

describe("configShapeError", () => {
  it("accepts a config carrying the four collections", () => {
    expect(configShapeError(valid())).toBeNull();
  });

  it("rejects what is not an object, including an array", () => {
    expect(configShapeError(null)).toMatch(/expected a JSON object/);
    expect(configShapeError("{}")).toMatch(/expected a JSON object/);
    expect(configShapeError([])).toMatch(/expected a JSON object/);
  });

  it("names the collection that is missing, which `{}` made every read fail on", () => {
    expect(configShapeError({})).toMatch(/source_containers must be an array/);
    const partial = { ...valid() } as Record<string, unknown>;
    delete partial.analytic_tables;
    expect(configShapeError(partial)).toMatch(/analytic_tables must be an array/);
  });
});

describe("publishConfig", () => {
  it("versions a valid config and passes the note through", async () => {
    saved.length = 0;
    const out = await publishConfig("demo", valid(), author, "renamed");
    expect(out).toMatchObject({ ok: true, value: { version: 1 } });
    expect(saved).toEqual([{ pipeline: "demo", note: "renamed" }]);
  });

  it("refuses `{}` with 422 and writes nothing", async () => {
    saved.length = 0;
    const out = await publishConfig("demo", {}, author);
    expect(out).toMatchObject({ ok: false, error: "invalid_config", status: 422 });
    expect(saved).toEqual([]);
  });

  it("refuses a config that is shaped right but does not validate", async () => {
    saved.length = 0;
    const unnamed = valid();
    // A table with no name: the editor blocks this, and so must a rename.
    unnamed.analytic_tables[0].name = "  ";
    const out = await publishConfig("demo", unnamed, author);
    expect(out).toMatchObject({ ok: false, error: "invalid_config" });
    expect(out.ok === false && out.message).toMatch(/missing a name/);
    expect(saved).toEqual([]);
  });

  it("refuses two tables sharing a name", async () => {
    saved.length = 0;
    const clash = valid();
    clash.analytic_tables.push({ ...clash.analytic_tables[0], id: "t2" });
    const out = await publishConfig("demo", clash, author);
    expect(out.ok === false && out.message).toMatch(/Duplicate Table name/);
    expect(saved).toEqual([]);
  });
});
