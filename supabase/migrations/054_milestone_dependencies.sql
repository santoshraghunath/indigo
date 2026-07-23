-- Milestone-to-milestone dependencies.
-- A milestone may optionally declare one predecessor (single-predecessor model).
-- When the predecessor's due_date shifts, the dependent date is recomputed
-- client-side as: predecessor.due_date + lag_days.

ALTER TABLE milestones
  ADD COLUMN predecessor_id uuid REFERENCES milestones(id) ON DELETE SET NULL,
  ADD COLUMN lag_days       integer NOT NULL DEFAULT 0;

CREATE INDEX ON milestones(predecessor_id);
