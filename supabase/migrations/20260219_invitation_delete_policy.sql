-- Allow admins to delete (cancel) pending invitations for their firm
CREATE POLICY "Admins can delete pending invitations for their firm"
  ON user_invitations FOR DELETE
  USING (
    firm_id = (SELECT firm_id FROM user_profiles WHERE user_id = auth.uid())
    AND (SELECT role FROM user_profiles WHERE user_id = auth.uid()) = 'admin'
    AND accepted_at IS NULL
  );
