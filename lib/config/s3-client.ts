// Shared S3 client factory.
//
// Reads connection parameters from environment variables and returns an
// `S3Client` configured for RustFS-compatible, path-style access.

import { S3Client, S3ServiceException } from "@aws-sdk/client-s3";
import { NextResponse } from "next/server";

export interface S3Config {
  /**
   * Bucket for ELT control-plane data: pipeline configs, dashboards, job
   * records. (`karet-pipelines`)
   */
  pipelinesBucket: string;
  /** Bucket for raw ingested CSV data. (`karet-lake`) */
  lakeBucket: string;
  /** Bucket for query-ready partitioned Parquet output. (`karet-warehouse`) */
  warehouseBucket: string;
  region: string;
  endpoint?: string;
  forcePathStyle: boolean;
  /**
   * S3 key for the Pipeline_Config JSON. The base config left by
   * `loadS3Config()` is a placeholder, always run it through
   * `pipelineS3Config(base, slug)` before calling `getPipelineConfig` /
   * `putPipelineConfig`, which is what fills this in with the real
   * per-pipeline path.
   */
  pipelineConfigKey: string;
  /** Prefix under which dashboard JSON files live. */
  dashboardsPrefix: string;
  /** Prefix under which saved-query JSON files live. */
  queriesPrefix: string;
  /**
   * Prefix (in the warehouse bucket) under which analytic-table folders
   * live. Each table's Parquet lives at `<warehousePrefix><tableId>/`.
   */
  warehousePrefix: string;
  /** Prefix under which pipeline folders live. */
  pipelinesPrefix: string;
}

function envOr(name: string, fallback: string): string {
  const value = process.env[name];
  return value && value.length > 0 ? value : fallback;
}

/** Loads S3 configuration from environment variables. */
export function loadS3Config(): S3Config {
  return {
    pipelinesBucket: envOr("S3_BUCKET_PIPELINES", "karet-pipelines"),
    lakeBucket: envOr("S3_BUCKET_LAKE", "karet-lake"),
    warehouseBucket: envOr("S3_BUCKET_WAREHOUSE", "karet-warehouse"),
    region: envOr("AWS_REGION", "us-east-1"),
    endpoint: process.env.AWS_ENDPOINT_URL || undefined,
    forcePathStyle:
      process.env.S3_FORCE_PATH_STYLE === undefined ||
      process.env.S3_FORCE_PATH_STYLE === "true",
    // Placeholders; scoped per-slug by `pipelineS3Config`.
    pipelineConfigKey: "",
    dashboardsPrefix: envOr("DASHBOARDS_PREFIX", "dashboards/"),
    queriesPrefix: envOr("QUERIES_PREFIX", "queries/"),
    warehousePrefix: "",
    pipelinesPrefix: envOr("PIPELINES_PREFIX", "pipelines/"),
  };
}

/** All three buckets, for lifecycle ops (delete/rename/export) that span every data class. */
export function allBuckets(config: S3Config): string[] {
  return [config.pipelinesBucket, config.lakeBucket, config.warehouseBucket];
}

/**
 * Pick the bucket for a key by its data class, inferred from the extension:
 * `.parquet` is warehouse output, `.csv` is raw lake data, everything else
 * (configs, dashboards, jobs) is pipelines. Used by import to unpack a zip
 * whose entries span all three buckets.
 */
export function bucketForRelPath(config: S3Config, relPath: string): string {
  if (relPath.endsWith(".parquet")) return config.warehouseBucket;
  if (relPath.endsWith(".csv")) return config.lakeBucket;
  return config.pipelinesBucket;
}

/** Returns an S3Config scoped to a specific pipeline slug. */
export function pipelineS3Config(base: S3Config, slug: string): S3Config {
  const prefix = `${base.pipelinesPrefix}${slug}/`;
  return {
    ...base,
    pipelineConfigKey: `${prefix}pipeline.json`,
    dashboardsPrefix: `${prefix}dashboards/`,
    queriesPrefix: `${prefix}queries/`,
    warehousePrefix: prefix,
  };
}

/** Factory: build a new S3 client from a config (or the environment). */
export function createS3Client(config: S3Config = loadS3Config()): S3Client {
  return new S3Client({
    region: config.region,
    ...(config.endpoint ? { endpoint: config.endpoint } : {}),
    ...(config.forcePathStyle ? { forcePathStyle: true } : {}),
  });
}

/** Returns true when an error is an S3 NoSuchBucket error. */
export function isNoSuchBucket(err: unknown): boolean {
  if (err instanceof S3ServiceException) {
    return err.name === "NoSuchBucket";
  }
  return (err as Record<string, unknown>)?.Code === "NoSuchBucket";
}

/**
 * Wraps an async handler body, catching S3 errors and returning an
 * appropriate JSON response. NoSuchBucket gets a dedicated 502 with a
 * user-friendly message; everything else falls back to 503.
 */
export async function wrapS3Error<T>(
  fn: () => Promise<T>,
  label: string,
): Promise<T | NextResponse> {
  try {
    return await fn();
  } catch (err) {
    console.error(`${label} failed:`, err);
    if (isNoSuchBucket(err)) {
      return NextResponse.json(
        {
          error: "bucket_not_found",
          message: `S3 bucket does not exist. Create it first or check the S3_BUCKET_PIPELINES / S3_BUCKET_LAKE / S3_BUCKET_WAREHOUSE environment variables.`,
        },
        { status: 502 },
      );
    }
    return NextResponse.json(
      { error: "s3_error", message: (err as Error).message },
      { status: 503 },
    );
  }
}

/**
 * Convenience wrapper around `loadS3Config()` + `createS3Client()` +
 * `wrapS3Error()`. Use from API route handlers that don't need to scope
 * the config to a specific pipeline slug.
 */
export function withS3<T>(
  label: string,
  fn: (client: S3Client, config: S3Config) => Promise<T>,
): Promise<T | NextResponse> {
  const config = loadS3Config();
  const client = createS3Client(config);
  return wrapS3Error(() => fn(client, config), label);
}

