// Stored at `pipelines/<slug>/queries/<id>.json`; dashboards reference one via
// `DashboardConfig.query_id`.

export interface SavedQuery {
  /** Slug derived from `name`; also the file stem and the reference key. */
  id: string;
  name: string;
  /** The read-only SELECT to run against the pipeline's warehouse tables. */
  sql: string;
}
