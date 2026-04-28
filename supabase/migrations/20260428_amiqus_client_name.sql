-- ────────────────────────────────────────────────────────
-- Migration: Add amiqus_client_name to amiqus_verifications
-- ────────────────────────────────────────────────────────
-- Stores the human-readable name of the client being verified so the
-- Hub UI and generated PDFs can identify which person each verification
-- relates to (especially useful when a corporate matter has multiple
-- directors / beneficial owners each with their own Amiqus record).
--
-- Backfill is handled by an in-app server action (backfillAmiqusClientNames)
-- which fetches names from the Amiqus API for any rows where this column
-- is null.
-- ────────────────────────────────────────────────────────

ALTER TABLE amiqus_verifications
  ADD COLUMN IF NOT EXISTS amiqus_client_name text;

COMMENT ON COLUMN amiqus_verifications.amiqus_client_name IS
  'Full name of the verified client (from Amiqus). Optional — falls back to record/case ID for display when null.';
