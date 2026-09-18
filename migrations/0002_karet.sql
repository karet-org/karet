-- Karet's control plane: the pipeline registry, config versions and job history.
--
-- What is deliberately not here: lake files, warehouse Parquet, table manifests,
-- dashboards and saved queries. Those stay in S3 so the buckets remain
-- self-describing and a sync yields a complete dataset.
--
-- No audit_log or schedules table yet. Both are easy to add once the features
-- that shape them exist, and guessing their columns now means building them
-- twice.

-- One row per pipeline. Listing pipelines used to mean listing a bucket prefix
-- and parsing every config, which is why one unparseable config could take the
-- whole landing page down.
CREATE TABLE pipelines (
  slug        text PRIMARY KEY,
  name        text NOT NULL,
  created_at  timestamptz NOT NULL DEFAULT now(),
  created_by  text REFERENCES "user"(id) ON DELETE SET NULL,
  archived_at timestamptz
);

-- Append-only. A save inserts; a restore inserts a copy and moves the pointer.
-- Nothing here is ever updated in place, so history cannot be rewritten.
CREATE TABLE config_versions (
  id         bigserial PRIMARY KEY,
  pipeline   text NOT NULL REFERENCES pipelines(slug) ON DELETE CASCADE,
  version    integer NOT NULL,
  config     jsonb NOT NULL,
  -- Null for a write authenticated by the service token, which has no account.
  author     text REFERENCES "user"(id) ON DELETE SET NULL,
  author_name text NOT NULL DEFAULT 'unknown',
  note       text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (pipeline, version)
);

CREATE INDEX config_versions_pipeline_idx ON config_versions(pipeline, version DESC);

-- Which version is live. Separate from config_versions so making a version live
-- is a pointer move rather than a mutation of the version itself.
CREATE TABLE pipelines_current (
  pipeline          text PRIMARY KEY REFERENCES pipelines(slug) ON DELETE CASCADE,
  config_version_id bigint NOT NULL REFERENCES config_versions(id),
  updated_at        timestamptz NOT NULL DEFAULT now()
);

-- Written by the worker, read by the web.
--
-- `config_version_id` is the reproducibility win: a run records exactly which
-- config produced it, so a save partway through a run can no longer change what
-- that run did, and "which config wrote these rows" has an answer.
CREATE TABLE jobs (
  id                 text PRIMARY KEY,
  pipeline           text NOT NULL REFERENCES pipelines(slug) ON DELETE CASCADE,
  config_version_id  bigint REFERENCES config_versions(id) ON DELETE SET NULL,
  status             text NOT NULL
    CONSTRAINT jobs_status_valid CHECK (status IN ('queued','running','completed','failed','cancelled')),
  trigger            text NOT NULL,
  attempts           integer NOT NULL DEFAULT 0,
  worker             text,
  enqueued_at        timestamptz NOT NULL,
  started_at         timestamptz,
  completed_at       timestamptz,
  files_processed    integer,
  partitions_written integer,
  rows_deduped       integer,
  error              text
);

-- The jobs page reads one pipeline newest-first; alerting will read across all
-- pipelines for recent failures.
CREATE INDEX jobs_pipeline_time_idx ON jobs(pipeline, enqueued_at DESC);
CREATE INDEX jobs_active_idx ON jobs(status) WHERE status IN ('queued', 'running');
CREATE INDEX jobs_failed_time_idx ON jobs(completed_at DESC) WHERE status = 'failed';
