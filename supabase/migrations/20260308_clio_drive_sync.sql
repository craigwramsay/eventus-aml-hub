-- Clio Drive Sync tracking table
-- Tracks document sync attempts from the Hub to Clio Drive.
-- Each row represents one file sync (evidence upload or finalisation HTML).

CREATE TABLE clio_drive_sync (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  firm_id           uuid NOT NULL REFERENCES firms(id) ON DELETE CASCADE,
  assessment_id     uuid NOT NULL REFERENCES assessments(id) ON DELETE CASCADE,
  evidence_id       uuid REFERENCES assessment_evidence(id) ON DELETE SET NULL,
  sync_type         text NOT NULL CHECK (sync_type IN ('evidence', 'finalisation_html')),
  status            text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'uploading', 'synced', 'failed')),
  clio_matter_id    text NOT NULL,
  clio_folder_id    integer,
  clio_document_id  integer,
  clio_document_url text,
  error_message     text,
  retry_count       integer NOT NULL DEFAULT 0,
  last_attempted_at timestamptz,
  synced_at         timestamptz,
  created_by        uuid,
  created_at        timestamptz DEFAULT now(),
  updated_at        timestamptz DEFAULT now()
);

ALTER TABLE clio_drive_sync ENABLE ROW LEVEL SECURITY;

-- RLS policies (firm-scoped, same pattern as amiqus_verifications)
CREATE POLICY "clio_drive_sync_select" ON clio_drive_sync
  FOR SELECT USING (
    firm_id = (SELECT firm_id FROM user_profiles WHERE user_id = auth.uid())
  );

CREATE POLICY "clio_drive_sync_insert" ON clio_drive_sync
  FOR INSERT WITH CHECK (
    firm_id = (SELECT firm_id FROM user_profiles WHERE user_id = auth.uid())
  );

CREATE POLICY "clio_drive_sync_update" ON clio_drive_sync
  FOR UPDATE USING (
    firm_id = (SELECT firm_id FROM user_profiles WHERE user_id = auth.uid())
  );

-- Indexes
CREATE INDEX idx_clio_drive_sync_evidence ON clio_drive_sync(evidence_id) WHERE evidence_id IS NOT NULL;
CREATE INDEX idx_clio_drive_sync_assessment ON clio_drive_sync(assessment_id);
CREATE INDEX idx_clio_drive_sync_failed ON clio_drive_sync(status, firm_id) WHERE status = 'failed';
