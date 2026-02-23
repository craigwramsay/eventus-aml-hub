-- Add human-readable reference to assessments (pattern: A-XXXXX-YYYY)
ALTER TABLE assessments ADD COLUMN reference TEXT;

-- Backfill existing rows using first 8 chars of UUID
UPDATE assessments SET reference = 'A-' || UPPER(SUBSTRING(id::text, 1, 8));

-- Now enforce NOT NULL
ALTER TABLE assessments ALTER COLUMN reference SET NOT NULL;

-- Ensure uniqueness
ALTER TABLE assessments ADD CONSTRAINT assessments_reference_unique UNIQUE (reference);
