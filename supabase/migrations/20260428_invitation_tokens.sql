-- ────────────────────────────────────────────────────────
-- Migration: Custom invitation token flow
-- ────────────────────────────────────────────────────────
-- Replaces Supabase's one-time-code email confirmation flow with our
-- own token-based invitation flow. The Supabase code flow was being
-- broken by Microsoft 365 Safe Links and similar URL pre-fetchers,
-- which consume the auth code before the recipient can click the link.
--
-- New flow:
--   1. inviteUser server action generates a long random token,
--      stores it in user_invitations alongside email/role/full_name,
--      and sends a custom email via Resend with a link to /invite/[token].
--   2. The /invite/[token] page is publicly accessible (no auth needed)
--      and looks up the invitation via the SECURITY DEFINER function
--      get_invitation_by_token().
--   3. The recipient sets a password and the acceptInvitation server
--      action calls supabase.auth.signUp() with their chosen password,
--      then marks the invitation accepted.
--
-- The token is the proof of email ownership (only the recipient
-- received the email), so Supabase's email confirmation step is no
-- longer needed. "Confirm email" should be DISABLED in the Supabase
-- Auth settings for this flow to work cleanly.
-- ────────────────────────────────────────────────────────

ALTER TABLE user_invitations
  ADD COLUMN IF NOT EXISTS full_name text,
  ADD COLUMN IF NOT EXISTS invite_token text,
  ADD COLUMN IF NOT EXISTS invite_token_expires_at timestamptz;

-- Backfill any existing rows with random tokens that won't match anything
-- real (existing pending invitations are effectively dead and should be
-- cancelled + re-issued). Using a clearly-bogus prefix so they're easy
-- to spot if anything ever tries to use them.
UPDATE user_invitations
SET invite_token = 'legacy_' || gen_random_uuid()::text,
    invite_token_expires_at = now() - interval '1 day'
WHERE invite_token IS NULL;

ALTER TABLE user_invitations
  ALTER COLUMN invite_token SET NOT NULL,
  ALTER COLUMN invite_token_expires_at SET NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_user_invitations_invite_token
  ON user_invitations(invite_token);

-- ────────────────────────────────────────────────────────
-- Function: get_invitation_by_token
-- ────────────────────────────────────────────────────────
-- Public read access to invitation details by token. Used by the
-- /invite/[token] page (which is unauthenticated — the token IS the
-- access control). SECURITY DEFINER so the function can read the
-- user_invitations row without an RLS-bound caller.
--
-- We deliberately limit the columns returned: no firm_id leaked, no
-- invited_by, just what the new user needs to see (their own email,
-- their full name as it was entered, and validity dates).
-- ────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION get_invitation_by_token(target_token text)
RETURNS TABLE(
  id uuid,
  email text,
  full_name text,
  role text,
  expires_at timestamptz,
  accepted_at timestamptz
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT
    id,
    email,
    full_name,
    role,
    invite_token_expires_at AS expires_at,
    accepted_at
  FROM user_invitations
  WHERE invite_token = target_token
  LIMIT 1;
$$;

GRANT EXECUTE ON FUNCTION get_invitation_by_token(text) TO anon, authenticated;

-- ────────────────────────────────────────────────────────
-- Function: accept_invitation_finalise
-- ────────────────────────────────────────────────────────
-- Called from the acceptInvitation server action AFTER auth.signUp()
-- has created the auth.users row. Atomically:
--   - validates the token matches the supplied user_id's email
--   - validates the invitation is unaccepted and unexpired
--   - inserts the user_profile row using the metadata stored on the
--     invitation (firm_id, role, full_name)
--   - marks the invitation accepted
--
-- SECURITY DEFINER so the new (just-signed-up) user can call this
-- before they're properly authenticated as themselves. The token
-- restricts who can call it to whoever has the email link.
-- ────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION accept_invitation_finalise(
  target_token text,
  target_user_id uuid
) RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $$
DECLARE
  v_invitation_id uuid;
  v_email text;
  v_full_name text;
  v_role text;
  v_firm_id uuid;
  v_expires_at timestamptz;
  v_accepted_at timestamptz;
  v_user_email text;
BEGIN
  -- Look up the invitation
  SELECT id, email, full_name, role, firm_id, invite_token_expires_at, accepted_at
  INTO v_invitation_id, v_email, v_full_name, v_role, v_firm_id, v_expires_at, v_accepted_at
  FROM user_invitations
  WHERE invite_token = target_token;

  IF v_invitation_id IS NULL THEN
    RAISE EXCEPTION 'Invitation not found' USING ERRCODE = 'P0002';
  END IF;

  IF v_accepted_at IS NOT NULL THEN
    RAISE EXCEPTION 'Invitation already accepted' USING ERRCODE = 'P0001';
  END IF;

  IF v_expires_at < now() THEN
    RAISE EXCEPTION 'Invitation expired' USING ERRCODE = 'P0001';
  END IF;

  -- Look up the auth user's email and confirm it matches the invitation.
  -- This guards against an attacker who knows a token but signs up with a
  -- different email — we'd be linking the invitation to the wrong account.
  SELECT email INTO v_user_email FROM auth.users WHERE id = target_user_id;

  IF v_user_email IS NULL THEN
    RAISE EXCEPTION 'Auth user not found' USING ERRCODE = 'P0002';
  END IF;

  IF lower(v_user_email) <> lower(v_email) THEN
    RAISE EXCEPTION 'Email on signup does not match invitation' USING ERRCODE = 'P0001';
  END IF;

  -- Upsert the user_profile (idempotent — if signUp was called twice we
  -- still don't want to fail).
  INSERT INTO user_profiles (user_id, firm_id, email, full_name, role)
  VALUES (target_user_id, v_firm_id, v_email, v_full_name, v_role)
  ON CONFLICT (user_id) DO UPDATE
    SET firm_id = EXCLUDED.firm_id,
        email = EXCLUDED.email,
        full_name = COALESCE(EXCLUDED.full_name, user_profiles.full_name),
        role = EXCLUDED.role;

  -- Mark the invitation accepted
  UPDATE user_invitations
  SET accepted_at = now()
  WHERE id = v_invitation_id;

  -- Audit
  INSERT INTO audit_events (firm_id, entity_type, entity_id, action, metadata, created_by)
  VALUES (
    v_firm_id,
    'user_invitation',
    v_invitation_id,
    'invite_accepted',
    jsonb_build_object('email', v_email, 'role', v_role),
    target_user_id
  );

  RETURN v_invitation_id;
END;
$$;

GRANT EXECUTE ON FUNCTION accept_invitation_finalise(text, uuid) TO authenticated;
