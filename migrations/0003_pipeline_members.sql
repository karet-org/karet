-- Per-pipeline access.
--
-- Roles alone are instance-wide: any account can read every pipeline, and any
-- editor can change every pipeline. That is the right default for a small team
-- sharing everything, and the wrong one as soon as a pipeline exists that some
-- of those people should not touch.
--
-- Two additions cover both:
--
--   * `pipelines.visibility` — `instance` keeps today's behaviour: everyone
--     sees it at their instance role. `members` hides it from everyone
--     except the people listed below, so a private pipeline is genuinely private
--     rather than merely read-only. (0004 later made `members` the default.)
--
--   * `pipeline_members` — an explicit grant that replaces the instance role for
--     that pipeline. It can widen (a viewer who edits one pipeline) or narrow (an
--     editor who may only read this one).
--
-- Instance admins keep admin everywhere: an access list that can lock the
-- operator out of a pipeline is a way to lose a pipeline.

ALTER TABLE pipelines
  ADD COLUMN visibility text NOT NULL DEFAULT 'instance'
    CONSTRAINT pipelines_visibility_valid CHECK (visibility IN ('instance', 'members'));

CREATE TABLE pipeline_members (
  pipeline   text NOT NULL REFERENCES pipelines(slug) ON DELETE CASCADE,
  user_id    text NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
  role       text NOT NULL
    CONSTRAINT pipeline_members_role_valid CHECK (role IN ('viewer', 'editor', 'admin')),
  granted_at timestamptz NOT NULL DEFAULT now(),
  granted_by text REFERENCES "user"(id) ON DELETE SET NULL,
  PRIMARY KEY (pipeline, user_id)
);

-- Read path: "which pipelines may this user see", and "what may they do here".
CREATE INDEX pipeline_members_user_idx ON pipeline_members(user_id);
