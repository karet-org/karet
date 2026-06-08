// Parquet parser built on `hyparquet` + `hyparquet-compressors`, plus a
// `serializeRow` helper that makes parquet rows JSON-safe (Date →
// ISO string, BigInt → Number, Buffer → utf-8 string).

import { parquetReadObjects } from "hyparquet";
import { compressors } from "hyparquet-compressors";

export type ParquetRow = Record<string, unknown>;

/** Recursively convert `BigInt` values to `Number`. */
export function convertBigIntsToNumbers(obj: ParquetRow): ParquetRow {
  const result: ParquetRow = {};
  for (const [key, value] of Object.entries(obj)) {
    result[key] = convertValue(value);
  }
  return result;
}

function convertValue(value: unknown): unknown {
  if (value === null || value === undefined) return value;
  if (typeof value === "bigint") return Number(value);
  if (value instanceof Date) return value;
  if (typeof Buffer !== "undefined" && Buffer.isBuffer(value)) return value;
  if (Array.isArray(value)) return value.map(convertValue);
  if (typeof value === "object") {
    return convertBigIntsToNumbers(value as ParquetRow);
  }
  return value;
}

/**
 * Coerce a row to JSON-serializable primitives:
 *   - `Date` → ISO string
 *   - `bigint` → number
 *   - `Buffer` → utf-8 string
 *
 * Everything else passes through. Used by API routes that send rows back
 * as JSON and by the dashboard SSR page that embeds rows in the response.
 */
export function serializeRow<T extends Record<string, unknown>>(
  row: ParquetRow,
): T {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(row)) {
    if (v instanceof Date) out[k] = v.toISOString();
    else if (typeof v === "bigint") out[k] = Number(v);
    else if (typeof Buffer !== "undefined" && Buffer.isBuffer(v))
      out[k] = v.toString("utf-8");
    else out[k] = v;
  }
  return out as T;
}

/**
 * Parse a Parquet buffer into an array of rows.
 *
 * Errors are swallowed and logged: a malformed file yields an empty array
 * so one bad partition never blocks the rest of a table.
 */
export async function parseParquet(buffer: Buffer): Promise<ParquetRow[]> {
  try {
    const arrayBuffer = buffer.buffer.slice(
      buffer.byteOffset,
      buffer.byteOffset + buffer.byteLength,
    ) as ArrayBuffer;

    const rows = (await parquetReadObjects({
      file: arrayBuffer,
      compressors,
    })) as ParquetRow[];

    return rows.map((r) => convertBigIntsToNumbers(r));
  } catch (error) {
    console.warn("Error parsing Parquet file:", error);
    return [];
  }
}

/**
 * Fetch and parse every partition for a table in parallel, returning
 * JSON-safe rows in partition-key order. A failed partition is logged and
 * skipped so one bad file never blocks the rest.
 */
export async function loadTableRows<T extends Record<string, unknown>>(
  keys: string[],
  fetchBuffer: (key: string) => Promise<Buffer>,
): Promise<T[]> {
  const perFile = await Promise.all(
    keys.map(async (key) => {
      try {
        const buffer = await fetchBuffer(key);
        const parsed = await parseParquet(buffer);
        return parsed.map((row) => serializeRow<T>(row));
      } catch (err) {
        console.warn(`Skipping Parquet file ${key}:`, err);
        return [] as T[];
      }
    }),
  );
  return perFile.flat();
}
