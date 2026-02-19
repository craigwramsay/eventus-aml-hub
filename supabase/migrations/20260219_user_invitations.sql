-- User Invitations Table
-- Tracks invitations sent by firm admins to new users

CREATE TABLE IF NOT EXISTS user_invitations (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  firm_id uuid NOT NULL REFERENCES firms(id),
  email text NOT NULL,
  role text NOT NULL CHECK (role IN ('solicitor', 'mlro', 'admin')),
  invited_by uuid NOT NULL REFERENCES user_profiles(id),
  accepted_at timestamptz,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE user_invitations ENABLE ROW LEVEL SECURITY;

-- Users can view invitations for their firm
CREATE POLICY "Users can view invitations for their firm"
  ON user_invitations FOR SELECT
  USING (firm_id = (SELECT firm_id FROM user_profiles WHERE id = auth.uid()));

-- Admins can create invitations
CREATE POLICY "Admins can create invitations"
  ON user_invitations FOR INSERT
  WITH CHECK (firm_id = (SELECT firm_id FROM user_profiles WHERE id = auth.uid()));
