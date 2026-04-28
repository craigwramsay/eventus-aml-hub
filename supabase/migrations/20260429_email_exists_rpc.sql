-- ────────────────────────────────────────────────────────
-- Function: email_in_auth_users
-- ────────────────────────────────────────────────────────
-- Returns true if the supplied email already exists in auth.users.
-- Used by inviteUser to reject upfront when an admin tries to invite
-- someone whose email is already registered — otherwise the invitation
-- email is sent but acceptance fails with "User already registered"
-- when the recipient submits their password.
--
-- SECURITY DEFINER so the authenticated role can call it without
-- needing direct SELECT on auth.users. Caller must be authenticated;
-- email comparison is case-insensitive (Supabase normalises).
-- ────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION email_in_auth_users(target_email text)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $$
  SELECT EXISTS (
    SELECT 1 FROM auth.users WHERE lower(email) = lower(target_email)
  );
$$;

GRANT EXECUTE ON FUNCTION email_in_auth_users(text) TO authenticated;
