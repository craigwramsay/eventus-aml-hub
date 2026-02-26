-- Track when each client's CDD was last verified
ALTER TABLE clients ADD COLUMN last_cdd_verified_at date;

-- clients table currently has no UPDATE RLS policy — must add one
-- so that the evidence server action can update last_cdd_verified_at
CREATE POLICY "Users can update clients for their firm"
  ON clients FOR UPDATE
  USING (firm_id = (SELECT firm_id FROM user_profiles WHERE user_id = auth.uid()))
  WITH CHECK (firm_id = (SELECT firm_id FROM user_profiles WHERE user_id = auth.uid()));
