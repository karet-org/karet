// Shared S3 client factory: env-derived config for RustFS-compatible path-style access.

import { S3Client, S3ServiceException } from "@aws-sdk/client-s3";
import { NextResponse } from "next/server";

export interface S3Config {
  /** ELT control-plane data: pipeline configs, dashboards, job records. */
  pipelinesBucket: string;
  /** Raw ingested CSV data. */
  lakeBucket: string;
  /** Query-ready partitioned Parquet output. */
  warehouseBucket: string;
  region: string;
  endpoint?: string;
  forcePathStyle: boolean;
  /**
   * S3 key for the Pipeline_Config JSON. `loadS3Config()` leaves a
   * placeholder — always run it through `pipelineS3Config(base, slug)` before
   * calling `getPipelineConfig` / `putPipelineConfig`.
   */
  pipelineConfigKey: string;
  /** Prefix under which dashboard JSON files live. */
  dashboardsPrefix: string;
  /** Prefix under which saved-query JSON files live. */
  queriesPrefix: string;
  /** Warehouse-bucket prefix; each table's Parquet lives at `<warehousePrefix><tableId>/`. */
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

/**
 * Bucket for a key by data class, inferred from the extension: `.parquet` is
 * warehouse, `.csv` is lake, everything else is pipelines.
 */
export function bucketForRelPath(config: S3Config, relPath: string): string {
  if (relPath.endsWith(".parquet")) return config.warehouseBucket;
  if (relPath.endsWith(".csv")) return config.lakeBucket;
  return config.pipelinesBucket;
}

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

export function createS3Client(config: S3Config = loadS3Config()): S3Client {
  return new S3Client({
    region: config.region,
    ...(config.endpoint ? { endpoint: config.endpoint } : {}),
    ...(config.forcePathStyle ? { forcePathStyle: true } : {}),
  });
}

export function isNoSuchBucket(err: unknown): boolean {
  if (err instanceof S3ServiceException) {
    return err.name === "NoSuchBucket";
  }
  return (err as Record<string, unknown>)?.Code === "NoSuchBucket";
}

/** Catch S3 errors and return a JSON response: 502 for NoSuchBucket, 503 otherwise. */
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

/** `loadS3Config()` + `createS3Client()` + `wrapS3Error()`, for routes that
 * don't scope the config to a pipeline slug. */
export function withS3<T>(
  label: string,
  fn: (client: S3Client, config: S3Config) => Promise<T>,
): Promise<T | NextResponse> {
  const config = loadS3Config();
  const client = createS3Client(config);
  return wrapS3Error(() => fn(client, config), label);
}

