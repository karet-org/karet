// Shared row / filter-value types for dashboard panel components.

export type Row = Record<string, unknown>;

export type FilterValues = Record<
  string,
  string | null | { start?: string; end?: string }
>;
