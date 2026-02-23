-- Allow MLRO and Admin to delete clients, matters, assessments, and related data for their firm

CREATE POLICY "MLRO and Admin can delete clients for their firm"
  ON clients FOR DELETE
  USING (
    firm_id = (SELECT firm_id FROM user_profiles WHERE user_id = auth.uid())
    AND (SELECT role FROM user_profiles WHERE user_id = auth.uid()) IN ('mlro', 'admin', 'platform_admin')
  );

CREATE POLICY "MLRO and Admin can delete matters for their firm"
  ON matters FOR DELETE
  USING (
    firm_id = (SELECT firm_id FROM user_profiles WHERE user_id = auth.uid())
    AND (SELECT role FROM user_profiles WHERE user_id = auth.uid()) IN ('mlro', 'admin', 'platform_admin')
  );

CREATE POLICY "MLRO and Admin can delete assessments for their firm"
  ON assessments FOR DELETE
  USING (
    firm_id = (SELECT firm_id FROM user_profiles WHERE user_id = auth.uid())
    AND (SELECT role FROM user_profiles WHERE user_id = auth.uid()) IN ('mlro', 'admin', 'platform_admin')
  );

CREATE POLICY "MLRO and Admin can delete assessment evidence for their firm"
  ON assessment_evidence FOR DELETE
  USING (
    firm_id = (SELECT firm_id FROM user_profiles WHERE user_id = auth.uid())
    AND (SELECT role FROM user_profiles WHERE user_id = auth.uid()) IN ('mlro', 'admin', 'platform_admin')
  );

CREATE POLICY "MLRO and Admin can delete CDD item progress for their firm"
  ON cdd_item_progress FOR DELETE
  USING (
    firm_id = (SELECT firm_id FROM user_profiles WHERE user_id = auth.uid())
    AND (SELECT role FROM user_profiles WHERE user_id = auth.uid()) IN ('mlro', 'admin', 'platform_admin')
  );
