-- Add jurisdiction column to firms table
-- Default to 'scotland' as the initial target market

ALTER TABLE firms ADD COLUMN IF NOT EXISTS jurisdiction text NOT NULL DEFAULT 'scotland'
  CHECK (jurisdiction IN ('scotland', 'england_and_wales'));
