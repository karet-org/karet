// Create the DuckLake catalog the analytic tables live in, and the read-only
// role the web app reads it as. Run by db-setup on every start, so it only
// creates what is missing and re-asserts the role's password and grants.
//
// The catalog is its own database on the same Postgres server. The worker
// writes it with the DATABASE_URL credentials; the web app attaches it as
// karet_lake_reader, which has SELECT on the catalog tables and nothing else.

import pg from "pg";

/** Postgres identifier. */
function ident(name) {
  return `"${name.replace(/"/g, '""')}"`;
}

/** SQL string literal. */
function lit(value) {
  return `'${String(value).replace(/'/g, "''")}'`;
}

/** The lake settings from the environment. */
export function lakeSettings(env = process.env) {
  return {
    databaseUrl: env.DATABASE_URL,
    database: env.LAKE_DATABASE || "karet_lake",
    reader: env.KARET_LAKE_READER_USER || "karet_lake_reader",
    readerPassword: env.KARET_LAKE_READER_PASSWORD,
    dataPath: `s3://${env.S3_BUCKET_WAREHOUSE || "karet-warehouse"}/lake/`,
  };
}

/** `client` is connected to the control-plane database as its owner. */
export async function ensureLake(client, settings = lakeSettings()) {
  const { database, reader, readerPassword, dataPath } = settings;
  if (!readerPassword) throw new Error("KARET_LAKE_READER_PASSWORD is not set");

  const exists = await client.query("SELECT 1 FROM pg_database WHERE datname = $1", [database]);
  if (exists.rowCount === 0) {
    await client.query(`CREATE DATABASE ${ident(database)}`);
    console.log(`[db-setup] created database ${database}`);
  }
  const role = await client.query("SELECT 1 FROM pg_roles WHERE rolname = $1", [reader]);
  if (role.rowCount === 0) await client.query(`CREATE ROLE ${ident(reader)} LOGIN`);
  await client.query(
    `ALTER ROLE ${ident(reader)} LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE PASSWORD ${lit(readerPassword)}`,
  );
  // Bounds any catalog query the app runs as this role.
  await client.query(`ALTER ROLE ${ident(reader)} SET statement_timeout = '30s'`);

  const url = new URL(settings.databaseUrl);
  const owner = decodeURIComponent(url.username);
  const lakeUrl = new URL(url);
  lakeUrl.pathname = `/${database}`;
  const lakeClient = new pg.Client({ connectionString: lakeUrl.toString() });
  await lakeClient.connect();
  try {
    await lakeClient.query("CREATE SCHEMA IF NOT EXISTS ducklake");
    await createCatalog(url, database, dataPath);
    await lakeClient.query(`GRANT CONNECT ON DATABASE ${ident(database)} TO ${ident(reader)}`);
    await lakeClient.query(`GRANT USAGE ON SCHEMA ducklake TO ${ident(reader)}`);
    await lakeClient.query(`GRANT SELECT ON ALL TABLES IN SCHEMA ducklake TO ${ident(reader)}`);
    // The worker creates a table for each table's inlined rows as it writes.
    await lakeClient.query(
      `ALTER DEFAULT PRIVILEGES FOR ROLE ${ident(owner)} IN SCHEMA ducklake GRANT SELECT ON TABLES TO ${ident(reader)}`,
    );
  } finally {
    await lakeClient.end().catch(() => {});
  }
}

/** Attach the catalog once with the owner's credentials, which creates it. */
async function createCatalog(url, database, dataPath) {
  const { DuckDBInstance } = await import("@duckdb/node-api");
  const instance = await DuckDBInstance.create(":memory:");
  const conn = await instance.connect();
  try {
    const home = process.env.DUCKDB_HOME || process.env.HOME || "/tmp";
    for (const stmt of [
      `SET home_directory = ${lit(home)}`,
      `SET extension_directory = ${lit(`${home}/.duckdb/extensions`)}`,
      "INSTALL ducklake",
      "LOAD ducklake",
      "INSTALL postgres",
      "LOAD postgres",
      "SET allow_persistent_secrets = false",
      `CREATE SECRET lake_owner (TYPE postgres, HOST ${lit(url.hostname)}, PORT ${Number(url.port) || 5432}, ` +
        `DATABASE ${lit(database)}, USER ${lit(decodeURIComponent(url.username))}, ` +
        `PASSWORD ${lit(decodeURIComponent(url.password))})`,
      `ATTACH 'ducklake:postgres:' AS lake (DATA_PATH ${lit(dataPath)}, METADATA_SCHEMA 'ducklake', META_SECRET 'lake_owner')`,
      "DETACH lake",
    ]) {
      await conn.run(stmt);
    }
  } finally {
    conn.closeSync();
    instance.closeSync();
  }
}
