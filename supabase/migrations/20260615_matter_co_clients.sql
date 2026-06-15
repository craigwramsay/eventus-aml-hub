-- Migration: matter_co_clients
-- Adds many-to-many between matters and clients so a single matter can have
-- multiple AML-relevant parties (joint sellers, co-applicants, co-guarantors)
-- without breaking the Clio sync model where each Clio matter has one primary
-- contact.
--
-- The primary client stays on matters.client_id (Clio-sourced, immutable from
-- the integration's perspective). Co-clients are additional Hub-managed
-- relationships stored here.

CREATE TABLE matter_co_clients (
  matter_id  uuid NOT NULL REFERENCES matters(id) ON DELETE CASCADE,
  client_id  uuid NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid,
  PRIMARY KEY (matter_id, client_id)
);

CREATE INDEX idx_matter_co_clients_client_id ON matter_co_clients(client_id);

ALTER TABLE matter_co_clients ENABLE ROW LEVEL SECURITY;

-- SELECT: any firm user can read co-clients for matters in their firm.
-- We check via matters → user_profiles. (RLS on matters already filters by firm.)
CREATE POLICY "matter_co_clients_select" ON matter_co_clients
  FOR SELECT USING (
    matter_id IN (
      SELECT id FROM matters
      WHERE firm_id = (SELECT firm_id FROM user_profiles WHERE user_id = auth.uid())
    )
  );

-- INSERT: any authenticated firm user can add a co-client to a matter in their firm
CREATE POLICY "matter_co_clients_insert" ON matter_co_clients
  FOR INSERT WITH CHECK (
    matter_id IN (
      SELECT id FROM matters
      WHERE firm_id = (SELECT firm_id FROM user_profiles WHERE user_id = auth.uid())
    )
    AND client_id IN (
      SELECT id FROM clients
      WHERE firm_id = (SELECT firm_id FROM user_profiles WHERE user_id = auth.uid())
    )
  );

-- DELETE: any authenticated firm user can remove a co-client
CREATE POLICY "matter_co_clients_delete" ON matter_co_clients
  FOR DELETE USING (
    matter_id IN (
      SELECT id FROM matters
      WHERE firm_id = (SELECT firm_id FROM user_profiles WHERE user_id = auth.uid())
    )
  );

-- No UPDATE policy — rows are immutable once added (delete + re-add if needed)
