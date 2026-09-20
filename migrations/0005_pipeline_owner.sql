-- A pipeline has an owner, and ownership can move.
--
-- `created_by` is a fact about the past and should stay one: it answers "who
-- made this". Access has to follow a question about the present instead, "whose
-- is this now", or a colleague who leaves keeps admin on everything they ever
-- built and the only way out is to delete the pipeline.
--
-- So access resolves against `owner_id`, which starts as the creator and can be
-- handed to somebody else. `ON DELETE SET NULL` rather than a default: when an
-- account is deleted the pipeline is ownerless, reachable by instance admins,
-- and one of them decides who takes it rather than the schema guessing.

ALTER TABLE pipelines
  ADD COLUMN owner_id text REFERENCES "user"(id) ON DELETE SET NULL;

UPDATE pipelines SET owner_id = created_by WHERE owner_id IS NULL;

-- Read on every access decision for a pipeline the caller does not own
-- instance-wide, and on every pipeline list.
CREATE INDEX pipelines_owner_idx ON pipelines(owner_id);
