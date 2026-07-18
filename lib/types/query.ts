// A named, reusable SQL query saved against a pipeline. Stored at
// `pipelines/<slug>/queries/<id>.json`; dashboards can read from one by
// setting `DashboardConfig.query_id`.

export interface SavedQuery {
  /** Slug derived from `name`; also the file stem and the reference key. */
  id: string;
  /** Human-readable name the user typed when saving. */
  name: string;
  /** The read-only SELECT to run against the pipeline's warehouse tables. */
  sql: string;
}
