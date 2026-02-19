-- Allow authenticated users to insert their own profile row
-- This is needed during the invite acceptance flow
CREATE POLICY "Users can create their own profile"
  ON user_profiles FOR INSERT
  WITH CHECK (user_id = auth.uid());
