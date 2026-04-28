-- ────────────────────────────────────────────────────────
-- Migration: fix "permission denied for table users" on
--           user_invitations UPDATE
-- ────────────────────────────────────────────────────────
-- The original "Users can accept their own invitations" policy
-- referenced auth.users in a subquery:
--
--   USING (email = (SELECT email FROM auth.users WHERE id = auth.uid()))
--
-- The `authenticated` role doesn't have SELECT permission on auth.users,
-- so this subquery fails with "permission denied for table users".
-- Postgres evaluates ALL UPDATE policies before allowing an UPDATE; if
-- any one errors out the whole statement aborts. So even though the
-- admin policy added in 20260429_invitation_admin_update.sql would
-- pass for a firm admin, the broken user policy errors first and
-- blocks the UPDATE entirely.
--
-- This was latent in the original 20260219_user_invitations.sql and
-- only surfaced when admin-driven UPDATEs (token refresh on resend)
-- were introduced.
--
-- Rewrites the policy to use Supabase's auth.email() helper, which
-- returns the current user's email without needing to read auth.users.
-- ────────────────────────────────────────────────────────

DROP POLICY IF EXISTS "Users can accept their own invitations" ON user_invitations;

CREATE POLICY "Users can accept their own invitations"
  ON user_invitations FOR UPDATE
  USING (email = auth.email())
  WITH CHECK (email = auth.email());
