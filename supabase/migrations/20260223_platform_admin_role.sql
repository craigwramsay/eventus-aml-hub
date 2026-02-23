-- Platform Admin role: superuser that can switch between firms
-- Replaces 20260223_set_cr_mlro.sql (which is now deleted)

-- 1. Widen CHECK constraint on user_profiles to include 'platform_admin'
ALTER TABLE user_profiles
  DROP CONSTRAINT IF EXISTS user_profiles_role_check;
ALTER TABLE user_profiles
  ADD CONSTRAINT user_profiles_role_check
  CHECK (role IN ('solicitor', 'mlro', 'admin', 'platform_admin'));

-- 2. Widen CHECK constraint on user_invitations
ALTER TABLE user_invitations
  DROP CONSTRAINT IF EXISTS user_invitations_role_check;
ALTER TABLE user_invitations
  ADD CONSTRAINT user_invitations_role_check
  CHECK (role IN ('solicitor', 'mlro', 'admin', 'platform_admin'));

-- 3. Platform admin can SELECT all firms (for firm switcher)
CREATE POLICY "Platform admin can view all firms"
  ON firms FOR SELECT
  USING (
    (SELECT role FROM user_profiles WHERE user_id = auth.uid()) = 'platform_admin'
  );

-- 4. Platform admin can UPDATE own user_profiles row (firm switching)
CREATE POLICY "Platform admin can update own profile for firm switch"
  ON user_profiles FOR UPDATE
  USING (
    user_id = auth.uid()
    AND (SELECT role FROM user_profiles WHERE user_id = auth.uid()) = 'platform_admin'
  )
  WITH CHECK (
    user_id = auth.uid()
    AND (SELECT role FROM user_profiles WHERE user_id = auth.uid()) = 'platform_admin'
  );

-- 5. Recreate entity DELETE policies with platform_admin added
DROP POLICY IF EXISTS "MLRO and Admin can delete clients for their firm" ON clients;
CREATE POLICY "MLRO, Admin, and Platform Admin can delete clients for their firm"
  ON clients FOR DELETE
  USING (
    firm_id = (SELECT firm_id FROM user_profiles WHERE user_id = auth.uid())
    AND (SELECT role FROM user_profiles WHERE user_id = auth.uid()) IN ('mlro', 'admin', 'platform_admin')
  );

DROP POLICY IF EXISTS "MLRO and Admin can delete matters for their firm" ON matters;
CREATE POLICY "MLRO, Admin, and Platform Admin can delete matters for their firm"
  ON matters FOR DELETE
  USING (
    firm_id = (SELECT firm_id FROM user_profiles WHERE user_id = auth.uid())
    AND (SELECT role FROM user_profiles WHERE user_id = auth.uid()) IN ('mlro', 'admin', 'platform_admin')
  );

DROP POLICY IF EXISTS "MLRO and Admin can delete assessments for their firm" ON assessments;
CREATE POLICY "MLRO, Admin, and Platform Admin can delete assessments for their firm"
  ON assessments FOR DELETE
  USING (
    firm_id = (SELECT firm_id FROM user_profiles WHERE user_id = auth.uid())
    AND (SELECT role FROM user_profiles WHERE user_id = auth.uid()) IN ('mlro', 'admin', 'platform_admin')
  );

-- NOTE: assessment_evidence and cdd_item_progress DELETE policies will be
-- created with platform_admin included when those tables are first deployed.
-- See 20260223_entity_delete_policies.sql (also pending application).

-- 6. Recreate user_invitations INSERT and DELETE policies with platform_admin
DROP POLICY IF EXISTS "Admins can create invitations" ON user_invitations;
CREATE POLICY "Admins and Platform Admin can create invitations"
  ON user_invitations FOR INSERT
  WITH CHECK (
    firm_id = (SELECT firm_id FROM user_profiles WHERE user_id = auth.uid())
    AND (SELECT role FROM user_profiles WHERE user_id = auth.uid()) IN ('admin', 'platform_admin')
  );

DROP POLICY IF EXISTS "Admins can delete pending invitations for their firm" ON user_invitations;
CREATE POLICY "Admins and Platform Admin can delete pending invitations for their firm"
  ON user_invitations FOR DELETE
  USING (
    firm_id = (SELECT firm_id FROM user_profiles WHERE user_id = auth.uid())
    AND (SELECT role FROM user_profiles WHERE user_id = auth.uid()) IN ('admin', 'platform_admin')
    AND accepted_at IS NULL
  );

-- 7. Set cr@eventuslaw.uk to platform_admin
UPDATE user_profiles
SET role = 'platform_admin'
WHERE email = 'cr@eventuslaw.uk';
