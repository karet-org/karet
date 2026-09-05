// Workspace-level UI settings, stored as one JSON object in the
// pipelines bucket (outside any pipeline prefix). Single-admin app, so
// there is exactly one settings document; names are cosmetic and starred
// is a set of pipeline slugs.

import {
  GetObjectCommand,
  PutObjectCommand,
  type S3Client,
} from "@aws-sdk/client-s3";
import type { S3Config } from "@/lib/config/s3-client";
import { readBodyToBuffer } from "@/lib/services/s3-helpers";

export interface UiSettings {
  displayName: string;
  workspaceName: string;
  starred: string[];
}

export const DEFAULT_SETTINGS: UiSettings = {
  displayName: "",
  workspaceName: "",
  starred: [],
};

const MAX_NAME = 64;
const MAX_STARRED = 200;
const SLUG = /^[a-z0-9][a-z0-9-]*$/;

function settingsKey(config: S3Config): string {
  return `${config.pipelinesPrefix}ui-settings.json`;
}

/**
 * Coerce unknown JSON into a valid UiSettings, dropping anything that
 * doesn't fit. Exported for tests.
 */
export function sanitizeSettings(raw: unknown): UiSettings {
  const obj = (raw ?? {}) as Record<string, unknown>;
  const name = (v: unknown) =>
    typeof v === "string" ? v.trim().slice(0, MAX_NAME) : "";
  const starred = Array.isArray(obj.starred)
    ? [
        ...new Set(
          obj.starred.filter(
            (s): s is string => typeof s === "string" && SLUG.test(s),
          ),
        ),
      ].slice(0, MAX_STARRED)
    : [];
  return {
    displayName: name(obj.displayName),
    workspaceName: name(obj.workspaceName),
    starred,
  };
}

/** Reads settings; a missing or unreadable document yields defaults. */
export async function getUiSettings(
  client: S3Client,
  config: S3Config,
): Promise<UiSettings> {
  try {
    const response = await client.send(
      new GetObjectCommand({
        Bucket: config.pipelinesBucket,
        Key: settingsKey(config),
      }),
    );
    const body = await readBodyToBuffer(response.Body);
    return sanitizeSettings(JSON.parse(body.toString("utf8")));
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

export async function putUiSettings(
  client: S3Client,
  config: S3Config,
  settings: UiSettings,
): Promise<void> {
  await client.send(
    new PutObjectCommand({
      Bucket: config.pipelinesBucket,
      Key: settingsKey(config),
      Body: JSON.stringify(settings, null, 2),
      ContentType: "application/json",
    }),
  );
}
