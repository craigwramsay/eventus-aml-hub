-- ────────────────────────────────────────────────────────
-- Admin user-deletion RPCs (SECURITY DEFINER)
-- ────────────────────────────────────────────────────────
-- These functions allow firm admins (and platform admins) to fully
-- delete users from auth.users — something the regular RLS-bound
-- supabase-js client cannot do because the auth.users table is owned
-- by the supabase_auth_admin role.
--
-- Two functions:
--
--   admin_purge_unconfirmed_invite(target_email)
--     Removes the auth.users row for an email address ONLY when:
--       - the account exists but email_confirmed_at IS NULL (i.e.,
--         the invitee never accepted), AND
--       - no user_profiles row exists for that user yet.
--     Used by cancelInvite() to clean up orphan auth.users rows
--     left behind when an invite was sent to a now-cancelled
--     address. Without this cleanup, re-inviting the same address
--     hits Supabase's anti-enumeration silent-success path and the
--     new email is never delivered.
--
--   admin_delete_firm_user(target_user_id)
--     Removes a fully-active user (with user_profile) from the firm.
--     Cleans up user_profiles and any pending user_invitations rows
--     by the same email, then deletes auth.users.
--     Self-deletion blocked. Cross-firm deletion blocked unless caller
--     is platform_admin. Historical references in other tables that
--     store created_by as a plain uuid (not an FK) are preserved by
--     design — we keep the audit trail.
--
-- Both functions:
--   - Run as SECURITY DEFINER so they can write to auth.users
--   - Pin search_path to prevent search-path-hijack attacks
--   - Validate caller permissions before performing any DELETE
--   - Log to audit_events with the authenticated caller as created_by
-- ────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION admin_purge_unconfirmed_invite(target_email text)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $$
DECLARE
  caller_user_id uuid := auth.uid();
  caller_role text;
  caller_firm_id uuid;
  v_auth_user_id uuid;
  v_email_confirmed_at timestamptz;
BEGIN
  -- Authorization: caller must be admin / mlro / platform_admin
  SELECT role, firm_id INTO caller_role, caller_firm_id
  FROM user_profiles WHERE user_id = caller_user_id;

  IF caller_role IS NULL THEN
    RAISE EXCEPTION 'Caller has no profile';
  END IF;

  IF caller_role NOT IN ('admin', 'mlro', 'platform_admin') THEN
    RAISE EXCEPTION 'Insufficient permissions';
  END IF;

  -- Find the auth user (case-insensitive email match — Supabase normalises to lower)
  SELECT id, email_confirmed_at INTO v_auth_user_id, v_email_confirmed_at
  FROM auth.users
  WHERE lower(email) = lower(target_email);

  IF v_auth_user_id IS NULL THEN
    RETURN false; -- nothing to purge
  END IF;

  -- Refuse to delete a confirmed account via this path — those have to go
  -- through admin_delete_firm_user where firm-membership is checked.
  IF v_email_confirmed_at IS NOT NULL THEN
    RAISE EXCEPTION 'Account is confirmed; use admin_delete_firm_user instead';
  END IF;

  -- Refuse to delete if a user_profile exists (the user joined a firm)
  IF EXISTS (SELECT 1 FROM user_profiles WHERE user_id = v_auth_user_id) THEN
    RAISE EXCEPTION 'User has an active profile; use admin_delete_firm_user instead';
  END IF;

  -- Delete the orphan auth.users row
  DELETE FROM auth.users WHERE id = v_auth_user_id;

  -- Audit log
  INSERT INTO audit_events (firm_id, entity_type, entity_id, action, metadata, created_by)
  VALUES (
    caller_firm_id,
    'auth_user',
    v_auth_user_id,
    'auth_user_purged',
    jsonb_build_object('email', target_email, 'reason', 'unconfirmed_invite'),
    caller_user_id
  );

  RETURN true;
END;
$$;

GRANT EXECUTE ON FUNCTION admin_purge_unconfirmed_invite(text) TO authenticated;


CREATE OR REPLACE FUNCTION admin_delete_firm_user(target_user_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $$
DECLARE
  caller_user_id uuid := auth.uid();
  caller_role text;
  caller_firm_id uuid;
  target_firm_id uuid;
  target_email text;
BEGIN
  -- Authorization
  SELECT role, firm_id INTO caller_role, caller_firm_id
  FROM user_profiles WHERE user_id = caller_user_id;

  IF caller_role IS NULL THEN
    RAISE EXCEPTION 'Caller has no profile';
  END IF;

  IF caller_role NOT IN ('admin', 'mlro', 'platform_admin') THEN
    RAISE EXCEPTION 'Insufficient permissions';
  END IF;

  IF target_user_id = caller_user_id THEN
    RAISE EXCEPTION 'Cannot delete your own account';
  END IF;

  -- Look up target's firm + email from user_profiles
  SELECT firm_id, email INTO target_firm_id, target_email
  FROM user_profiles WHERE user_id = target_user_id;

  IF target_firm_id IS NULL THEN
    RAISE EXCEPTION 'User profile not found';
  END IF;

  -- Cross-firm deletion blocked unless platform_admin
  IF caller_role <> 'platform_admin' AND target_firm_id <> caller_firm_id THEN
    RAISE EXCEPTION 'Cannot delete users outside your firm';
  END IF;

  -- Delete in dependency order. We do NOT touch tables where the user is
  -- referenced as `created_by` for historical records (assessments,
  -- assessment_evidence, audit_events, etc.) — those are plain uuid
  -- columns, not FKs, so deleting auth.users won't cascade.
  DELETE FROM user_profiles WHERE user_id = target_user_id;
  DELETE FROM user_invitations WHERE lower(email) = lower(target_email);
  DELETE FROM auth.users WHERE id = target_user_id;

  -- Audit log
  INSERT INTO audit_events (firm_id, entity_type, entity_id, action, metadata, created_by)
  VALUES (
    caller_firm_id,
    'user_profile',
    target_user_id,
    'user_deleted',
    jsonb_build_object('email', target_email, 'firm_id', target_firm_id),
    caller_user_id
  );
END;
$$;

GRANT EXECUTE ON FUNCTION admin_delete_firm_user(uuid) TO authenticated;
