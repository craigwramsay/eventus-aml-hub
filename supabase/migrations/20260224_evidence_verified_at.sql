-- Add verified_at column to track when identity verification actually occurred
-- (separate from created_at which tracks when the record was added to the system)
ALTER TABLE assessment_evidence ADD COLUMN verified_at date;
