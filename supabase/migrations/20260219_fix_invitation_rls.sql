-- Fix user_invitations RLS policies
-- 1. Fix column reference (id → user_id) in SELECT policy
-- 2. Restrict INSERT to admins only (defence in depth)
-- 3. Add UPDATE policy for invite acceptance

-- Drop existing policies
DROP POLICY IF EXISTS "Users can view invitations for their firm" ON user_invitations;
DROP POLICY IF EXISTS "Admins can create invitations" ON user_invitations;

-- Recreate with correct column and admin restriction
CREATE POLICY "Users can view invitations for their firm"
  ON user_invitations FOR SELECT
  USING (firm_id = (SELECT firm_id FROM user_profiles WHERE user_id = auth.uid()));

CREATE POLICY "Admins can create invitations"
  ON user_invitations FOR INSERT
  WITH CHECK (
    firm_id = (SELECT firm_id FROM user_profiles WHERE user_id = auth.uid())
    AND (SELECT role FROM user_profiles WHERE user_id = auth.uid()) = 'admin'
  );

-- Allow users to accept their own invitations (update accepted_at)
CREATE POLICY "Users can accept their own invitations"
  ON user_invitations FOR UPDATE
  USING (email = (SELECT email FROM auth.users WHERE id = auth.uid()))
  WITH CHECK (email = (SELECT email FROM auth.users WHERE id = auth.uid()));
