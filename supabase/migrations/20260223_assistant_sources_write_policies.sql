-- Add INSERT and DELETE RLS policies for assistant_sources
-- INSERT/DELETE restricted to admin and platform_admin roles (same users who can manage users)

-- Allow admins to insert assistant sources for their firm
CREATE POLICY "Admins can insert assistant sources"
  ON assistant_sources FOR INSERT
  WITH CHECK (
    firm_id = (SELECT firm_id FROM user_profiles WHERE user_id = auth.uid())
    AND (SELECT role FROM user_profiles WHERE user_id = auth.uid()) IN ('admin', 'platform_admin')
  );

-- Allow admins to delete assistant sources for their firm
CREATE POLICY "Admins can delete assistant sources"
  ON assistant_sources FOR DELETE
  USING (
    firm_id = (SELECT firm_id FROM user_profiles WHERE user_id = auth.uid())
    AND (SELECT role FROM user_profiles WHERE user_id = auth.uid()) IN ('admin', 'platform_admin')
  );

-- Allow admins to update assistant sources for their firm (needed for embedding backfill)
CREATE POLICY "Admins can update assistant sources"
  ON assistant_sources FOR UPDATE
  USING (
    firm_id = (SELECT firm_id FROM user_profiles WHERE user_id = auth.uid())
    AND (SELECT role FROM user_profiles WHERE user_id = auth.uid()) IN ('admin', 'platform_admin')
  )
  WITH CHECK (
    firm_id = (SELECT firm_id FROM user_profiles WHERE user_id = auth.uid())
  );
