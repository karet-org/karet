// Shapes the Data page reads from the tables endpoint.

export interface ColumnInfo {
  name: string;
  type: string;
}

export interface TableInfo {
  id: string;
  name: string;
  schema: ColumnInfo[];
  partitionKeys: string[];
  dedupKeys: string[];
  fileCount: number;
  /** 0 until a run has published the table. */
  version: number;
  /** Null when it could not be counted. */
  rowCount: number | null;
  /** When the live version was published, ISO 8601. */
  publishedAt: string | null;
  /** SQL identifier to use in a query. */
  slug: string;
  /** id of a table whose slug this one's collides with, else null. */
  collidesWith: string | null;
}
