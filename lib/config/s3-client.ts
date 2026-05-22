// Shared S3 client factory.
//
// Reads connection parameters from environment variables and returns an
// `S3Client` configured for RustFS-compatible, path-style access.

import { S3Client, S3ServiceException } from "@aws-sdk/client-s3";
import { NextResponse } from "next/server";

export interface S3Config {
  bucket: string;
  region: string;
  endpoint?: string;
  forcePathStyle: boolean;
  /**
   * S3 key for the Pipeline_Config JSON. The base config left by
   * `loadS3Config()` is a placeholder -- always run it through
   * `pipelineS3Config(base, slug)` before calling `getPipelineConfig` /
   * `putPipelineConfig`, which is what fills this in with the real
   * per-pipeline path.
   */
  pipelineConfigKey: string;
  /** Prefix under which dashboard JSON files live. */
  dashboardsPrefix: string;
  /** Prefix under which clean analytic-table Parquet files live. */
  cleanPrefix: string;
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
    bucket: envOr("S3_BUCKET", "karet-data"),
    region: envOr("AWS_REGION", "us-east-1"),
    endpoint: process.env.S3_ENDPOINT || undefined,
    forcePathStyle:
      process.env.S3_FORCE_PATH_STYLE === undefined ||
      process.env.S3_FORCE_PATH_STYLE === "true",
    // Placeholder -- callers that read/write pipeline.json must scope via
    // `pipelineS3Config(base, slug)` first.
    pipelineConfigKey: "",
    dashboardsPrefix: envOr("DASHBOARDS_PREFIX", "dashboards/"),
    cleanPrefix: envOr("CLEAN_PREFIX", "clean/"),
    pipelinesPrefix: envOr("PIPELINES_PREFIX", "pipelines/"),
  };
}

/** Returns an S3Config scoped to a specific pipeline slug. */
export function pipelineS3Config(base: S3Config, slug: string): S3Config {
  const prefix = `${base.pipelinesPrefix}${slug}/`;
  return {
    ...base,
    pipelineConfigKey: `${prefix}pipeline.json`,
    dashboardsPrefix: `${prefix}dashboards/`,
    cleanPrefix: `${prefix}clean/`,
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
          message: `S3 bucket does not exist. Create it first or check the S3_BUCKET environment variable.`,
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

