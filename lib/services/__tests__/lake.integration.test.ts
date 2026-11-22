// The web app's view of the DuckLake catalog, against a real Postgres: the
// setup db-setup runs, the read-only attach, table versions, and what user SQL
// can and cannot do through it.
//
// Skipped unless KARET_LAKE_TEST_DATABASE_URL names a Postgres superuser
// connection. The rows are inlined into the catalog, so no S3 is needed.

import { randomUUID } from "node:crypto";
import pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const url = process.env.KARET_LAKE_TEST_DATABASE_URL;
const suffix = randomUUID().slice(0, 8);
const settings = {
  databaseUrl: url ?? "",
  database: `karet_lake_test_${suffix}`,
  reader: `karet_lake_reader_${suffix}`,
  readerPassword: `pw-${randomUUID()}`,
  dataPath: "s3://karet-warehouse/lake/",
};

function lit(value: string): string {
  return `'${value.replace(/'/g, "''")}'`;
}

/** Write two versions of `"p-1"."t"` as the catalog owner, as the worker does. */
async function seed(): Promise<void> {
  const { DuckDBInstance } = await import("@duckdb/node-api");
  const instance = await DuckDBInstance.create(":memory:");
  const conn = await instance.connect();
  const u = new URL(url!);
  for (const stmt of [
    "LOAD ducklake",
    "LOAD postgres",
    `CREATE SECRET owner (TYPE postgres, HOST ${lit(u.hostname)}, PORT ${Number(u.port) || 5432}, DATABASE ${lit(settings.database)}, USER ${lit(decodeURIComponent(u.username))}, PASSWORD ${lit(decodeURIComponent(u.password))})`,
    `ATTACH 'ducklake:postgres:' AS lake (METADATA_SCHEMA 'ducklake', META_SECRET 'owner', DATA_INLINING_ROW_LIMIT 1000)`,
    `CREATE SCHEMA lake."p-1"`,
    `CREATE TABLE lake."p-1".t (k VARCHAR, v BIGINT, _karet_mapping VARCHAR)`,
    "BEGIN",
    `INSERT INTO lake."p-1".t VALUES ('a', 1, 'm'), ('b', 2, 'm')`,
    "CALL lake.set_commit_message('karet-worker', 'job j1')",
    "COMMIT",
    "BEGIN",
    `INSERT INTO lake."p-1".t VALUES ('c', 3, 'm')`,
    "CALL lake.set_commit_message('karet-worker', 'job j2')",
    "COMMIT",
  ]) {
    await conn.run(stmt);
  }
  conn.closeSync();
  instance.closeSync();
}

describe.skipIf(!url)("DuckLake catalog", () => {
  let duckdb: typeof import("@/lib/services/duckdb");
  let versions: typeof import("@/lib/services/table-versions");

  beforeAll(async () => {
    const client = new pg.Client({ connectionString: url });
    await client.connect();
    const { ensureLake } = await import("../../../scripts/lake-setup.mjs");
    await ensureLake(client, settings);
    // A second run must change nothing and not fail.
    await ensureLake(client, settings);
    await client.end();
    await seed();

    process.env.DATABASE_URL = url;
    process.env.LAKE_DATABASE = settings.database;
    process.env.KARET_LAKE_READER_USER = settings.reader;
    process.env.KARET_LAKE_READER_PASSWORD = settings.readerPassword;
    duckdb = await import("@/lib/services/duckdb");
    versions = await import("@/lib/services/table-versions");
  }, 120_000);

  afterAll(async () => {
    const client = new pg.Client({ connectionString: url });
    await client.connect();
    await client.query(`DROP DATABASE IF EXISTS "${settings.database}" WITH (FORCE)`);
    await client.query(`DROP ROLE IF EXISTS "${settings.reader}"`);
    await client.end();
  });

  it("reads the live rows without the mapping column", async () => {
    const source = await duckdb.warehouseSource("p-1", "t");
    expect(source).not.toBeNull();
    const result = await duckdb.executeUserQuery([{ slug: "t", source: source! }], "SELECT * FROM t ORDER BY k");
    expect(result).toEqual({
      columns: ["k", "v"],
      rows: [
        { k: "a", v: 1 },
        { k: "b", v: 2 },
        { k: "c", v: 3 },
      ],
    });
    expect(await duckdb.warehouseSource("p-1", "missing")).toBeNull();
  });

  it("lists versions newest first and reads an older one", async () => {
    const list = await versions.listTableVersions("p-1", "t");
    expect(list.map((v) => v.job_id)).toEqual(["j2", "j1"]);
    expect(list.map((v) => v.live)).toEqual([true, false]);
    const live = await versions.liveVersion("p-1", "t");
    expect(live?.version).toBe(list[0].version);
    expect(await versions.liveRowCount("p-1", "t")).toBe(3);

    const old = await duckdb.warehouseSource("p-1", "t", list[1].version);
    const result = await duckdb.executeUserQuery([{ slug: "t", source: old! }], "SELECT count(*) AS n FROM t");
    expect(result).toEqual({ columns: ["n"], rows: [{ n: 2 }] });
  });

  it("refuses writes made through SELECT", async () => {
    for (const sql of [
      "SELECT * FROM ducklake_flush_inlined_data('lake')",
      "SELECT * FROM ducklake_expire_snapshots('lake', versions => [1])",
      "SELECT * FROM postgres_execute('__ducklake_metadata_lake', 'CREATE TABLE ducklake.x (i int)')",
      "SELECT * FROM postgres_scan('host=127.0.0.1 dbname=postgres', 'public', 'pg_user')",
      "SELECT * FROM postgres_query('__ducklake_metadata_lake', 'SELECT pg_sleep(5)')",
      "SELECT * FROM postgres_attach('host=127.0.0.1 dbname=postgres')",
      "SELECT * FROM postgres_configure_pool(catalog_name => '__ducklake_metadata_lake', max_connections => 0)",
      "SELECT * FROM query('SELECT 1 FROM postgres_scan(''x'', ''y'', ''z'')')",
    ]) {
      expect(await duckdb.executeUserQuery([], sql), sql).toHaveProperty("error");
    }
    const after = await versions.listTableVersions("p-1", "t");
    expect(after).toHaveLength(2);
  });

  it("still reads older versions through the app's versions option, but not with AT in user SQL", async () => {
    const list = await versions.listTableVersions("p-1", "t");
    const at = await duckdb.executeUserQuery([], `SELECT count(*) FROM lake."p-1".t AT (VERSION => ${list[1].version})`);
    expect(at).toHaveProperty("error");
    const old = await duckdb.warehouseSource("p-1", "t", list[1].version);
    expect(await duckdb.executeUserQuery([{ slug: "t", source: old! }], "SELECT count(*) AS n FROM t")).toEqual({
      columns: ["n"],
      rows: [{ n: 2 }],
    });
  });

  it("does not show the reader's password", async () => {
    const result = await duckdb.executeUserQuery([], "SELECT secret_string FROM duckdb_secrets()");
    expect(JSON.stringify(result)).not.toContain(settings.readerPassword);
  });
});
