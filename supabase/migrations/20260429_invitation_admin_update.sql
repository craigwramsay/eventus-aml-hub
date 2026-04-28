-- ────────────────────────────────────────────────────────
-- Migration: allow firm admins to update invitations
-- ────────────────────────────────────────────────────────
-- The original RLS only allowed the invitee themselves to UPDATE
-- their row (to mark accepted_at). The new token-based flow has the
-- admin re-issuing a token via resendInvite — that needs an UPDATE
-- by the admin, not the invitee. Without this policy, the UPDATE was
-- silently filtered out by RLS and the action returned "Failed to
-- refresh invitation token".
--
-- This migration adds a parallel UPDATE policy for admins / mlros /
-- platform_admins, scoped to invitations in their own firm.
-- ────────────────────────────────────────────────────────

CREATE POLICY "Admins can update invitations in their firm"
  ON user_invitations FOR UPDATE
  USING (
    firm_id = (SELECT firm_id FROM user_profiles WHERE user_id = auth.uid())
    AND (SELECT role FROM user_profiles WHERE user_id = auth.uid())
        IN ('admin', 'platform_admin')
  )
  WITH CHECK (
    firm_id = (SELECT firm_id FROM user_profiles WHERE user_id = auth.uid())
    AND (SELECT role FROM user_profiles WHERE user_id = auth.uid())
        IN ('admin', 'platform_admin')
  );
