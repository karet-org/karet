-- Invite-only by default.
--
-- 0003 defaulted `visibility` to 'instance', so a new pipeline was readable by
-- everyone signed in from the moment it existed. A pipeline usually holds
-- somebody's data before its author has decided who should see it, so the
-- default belongs at the closed end: access is granted, not assumed.
--
-- The creator gets an admin grant in `createPipeline`. Without it an editor
-- would create a pipeline and immediately lose sight of it, since a
-- members-only pipeline with no members is reachable only by instance admins.
--
-- Existing rows keep the visibility they have. Flipping them would hide
-- pipelines people already work on, and each one would need an admin to undo.

ALTER TABLE pipelines ALTER COLUMN visibility SET DEFAULT 'members';
