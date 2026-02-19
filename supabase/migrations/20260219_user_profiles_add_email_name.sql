-- Add email and full_name columns to user_profiles
-- These are needed for user management UI (admin can see who belongs to the firm)

ALTER TABLE user_profiles
  ADD COLUMN IF NOT EXISTS email text,
  ADD COLUMN IF NOT EXISTS full_name text;

-- Backfill email from auth.users for existing profiles
UPDATE user_profiles
SET email = au.email
FROM auth.users au
WHERE user_profiles.user_id = au.id
  AND user_profiles.email IS NULL;
