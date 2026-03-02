-- Per-firm configuration system
-- Tables: regulatory_baseline, firm_config_versions, firm_config_gap_acknowledgements, firm_documents
-- Column additions to firms + assessments

-- ============================================
-- Table: regulatory_baseline
-- Platform-managed baseline rules (single active row, versioned)
-- ============================================
CREATE TABLE IF NOT EXISTS regulatory_baseline (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  version_number integer NOT NULL UNIQUE,
  baseline_rules jsonb NOT NULL,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'superseded')),
  created_by uuid REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  change_summary text
);

-- Only one active baseline at a time
CREATE UNIQUE INDEX idx_regulatory_baseline_active
  ON regulatory_baseline (status) WHERE status = 'active';

-- RLS
ALTER TABLE regulatory_baseline ENABLE ROW LEVEL SECURITY;

-- All authenticated users can read
CREATE POLICY "regulatory_baseline_select"
  ON regulatory_baseline FOR SELECT
  TO authenticated
  USING (true);

-- Only platform_admin can insert
CREATE POLICY "regulatory_baseline_insert"
  ON regulatory_baseline FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM user_profiles
      WHERE user_profiles.user_id = auth.uid()
      AND user_profiles.role = 'platform_admin'
    )
  );

-- Only platform_admin can update (to supersede)
CREATE POLICY "regulatory_baseline_update"
  ON regulatory_baseline FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM user_profiles
      WHERE user_profiles.user_id = auth.uid()
      AND user_profiles.role = 'platform_admin'
    )
  );

-- ============================================
-- Table: firm_config_versions
-- Per-firm config snapshots (immutable once active)
-- ============================================
CREATE TABLE IF NOT EXISTS firm_config_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  firm_id uuid NOT NULL REFERENCES firms(id) ON DELETE CASCADE,
  version_number integer NOT NULL,
  risk_scoring jsonb NOT NULL,
  cdd_ruleset jsonb NOT NULL,
  sector_mapping jsonb NOT NULL,
  cdd_staleness jsonb NOT NULL,
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'active', 'superseded')),
  created_by uuid REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  activated_at timestamptz,
  activated_by uuid REFERENCES auth.users(id),
  superseded_at timestamptz,
  change_summary text,
  UNIQUE(firm_id, version_number)
);

-- Only one active config per firm
CREATE UNIQUE INDEX idx_firm_config_active
  ON firm_config_versions (firm_id) WHERE status = 'active';

-- RLS
ALTER TABLE firm_config_versions ENABLE ROW LEVEL SECURITY;

-- Firm-scoped SELECT
CREATE POLICY "firm_config_versions_select"
  ON firm_config_versions FOR SELECT
  TO authenticated
  USING (
    firm_id IN (
      SELECT firm_id FROM user_profiles WHERE user_id = auth.uid()
    )
    OR EXISTS (
      SELECT 1 FROM user_profiles
      WHERE user_profiles.user_id = auth.uid()
      AND user_profiles.role = 'platform_admin'
    )
  );

-- Firm-scoped INSERT (MLRO / admin / platform_admin)
CREATE POLICY "firm_config_versions_insert"
  ON firm_config_versions FOR INSERT
  TO authenticated
  WITH CHECK (
    firm_id IN (
      SELECT firm_id FROM user_profiles
      WHERE user_id = auth.uid()
      AND role IN ('mlro', 'admin', 'platform_admin')
    )
    OR EXISTS (
      SELECT 1 FROM user_profiles
      WHERE user_profiles.user_id = auth.uid()
      AND user_profiles.role = 'platform_admin'
    )
  );

-- Firm-scoped UPDATE (MLRO / admin / platform_admin)
CREATE POLICY "firm_config_versions_update"
  ON firm_config_versions FOR UPDATE
  TO authenticated
  USING (
    firm_id IN (
      SELECT firm_id FROM user_profiles
      WHERE user_id = auth.uid()
      AND role IN ('mlro', 'admin', 'platform_admin')
    )
    OR EXISTS (
      SELECT 1 FROM user_profiles
      WHERE user_profiles.user_id = auth.uid()
      AND user_profiles.role = 'platform_admin'
    )
  );

-- ============================================
-- Table: firm_config_gap_acknowledgements
-- MLRO gap rationale records
-- ============================================
CREATE TABLE IF NOT EXISTS firm_config_gap_acknowledgements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  firm_id uuid NOT NULL REFERENCES firms(id) ON DELETE CASCADE,
  config_version_id uuid NOT NULL REFERENCES firm_config_versions(id) ON DELETE CASCADE,
  gap_code text NOT NULL,
  gap_description text NOT NULL,
  baseline_requirement text NOT NULL,
  firm_value text,
  acknowledged_by uuid NOT NULL REFERENCES auth.users(id),
  acknowledged_at timestamptz NOT NULL DEFAULT now(),
  rationale text NOT NULL CHECK (char_length(rationale) >= 20),
  UNIQUE(config_version_id, gap_code)
);

-- RLS
ALTER TABLE firm_config_gap_acknowledgements ENABLE ROW LEVEL SECURITY;

-- Firm-scoped SELECT
CREATE POLICY "firm_config_gap_ack_select"
  ON firm_config_gap_acknowledgements FOR SELECT
  TO authenticated
  USING (
    firm_id IN (
      SELECT firm_id FROM user_profiles WHERE user_id = auth.uid()
    )
    OR EXISTS (
      SELECT 1 FROM user_profiles
      WHERE user_profiles.user_id = auth.uid()
      AND user_profiles.role = 'platform_admin'
    )
  );

-- Firm-scoped INSERT
CREATE POLICY "firm_config_gap_ack_insert"
  ON firm_config_gap_acknowledgements FOR INSERT
  TO authenticated
  WITH CHECK (
    firm_id IN (
      SELECT firm_id FROM user_profiles
      WHERE user_id = auth.uid()
      AND role IN ('mlro', 'platform_admin')
    )
  );

-- ============================================
-- Table: firm_documents
-- PWRA/PCP reference uploads
-- ============================================
CREATE TABLE IF NOT EXISTS firm_documents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  firm_id uuid NOT NULL REFERENCES firms(id) ON DELETE CASCADE,
  document_type text NOT NULL CHECK (document_type IN ('pwra', 'pcp', 'aml_policy', 'other')),
  file_name text NOT NULL,
  file_path text NOT NULL,
  file_size integer,
  description text,
  uploaded_by uuid NOT NULL REFERENCES auth.users(id),
  uploaded_at timestamptz NOT NULL DEFAULT now(),
  config_version_id uuid REFERENCES firm_config_versions(id)
);

-- RLS
ALTER TABLE firm_documents ENABLE ROW LEVEL SECURITY;

-- Firm-scoped SELECT
CREATE POLICY "firm_documents_select"
  ON firm_documents FOR SELECT
  TO authenticated
  USING (
    firm_id IN (
      SELECT firm_id FROM user_profiles WHERE user_id = auth.uid()
    )
    OR EXISTS (
      SELECT 1 FROM user_profiles
      WHERE user_profiles.user_id = auth.uid()
      AND user_profiles.role = 'platform_admin'
    )
  );

-- Firm-scoped INSERT
CREATE POLICY "firm_documents_insert"
  ON firm_documents FOR INSERT
  TO authenticated
  WITH CHECK (
    firm_id IN (
      SELECT firm_id FROM user_profiles
      WHERE user_id = auth.uid()
      AND role IN ('mlro', 'admin', 'platform_admin')
    )
  );

-- Firm-scoped DELETE
CREATE POLICY "firm_documents_delete"
  ON firm_documents FOR DELETE
  TO authenticated
  USING (
    firm_id IN (
      SELECT firm_id FROM user_profiles
      WHERE user_id = auth.uid()
      AND role IN ('mlro', 'admin', 'platform_admin')
    )
  );

-- ============================================
-- Column additions to existing tables
-- ============================================

-- firms: config status + active config pointer
ALTER TABLE firms
  ADD COLUMN IF NOT EXISTS config_status text DEFAULT 'unconfigured'
    CHECK (config_status IN ('unconfigured', 'draft', 'active'));

ALTER TABLE firms
  ADD COLUMN IF NOT EXISTS active_config_version_id uuid
    REFERENCES firm_config_versions(id);

-- assessments: link to config version used
ALTER TABLE assessments
  ADD COLUMN IF NOT EXISTS config_version_id uuid
    REFERENCES firm_config_versions(id);

-- ============================================
-- Storage bucket for firm documents
-- ============================================
INSERT INTO storage.buckets (id, name, public)
VALUES ('firm-documents', 'firm-documents', false)
ON CONFLICT (id) DO NOTHING;

-- Storage RLS: firm-scoped using folder path = firm_id
CREATE POLICY "firm_documents_storage_select"
  ON storage.objects FOR SELECT
  TO authenticated
  USING (
    bucket_id = 'firm-documents'
    AND (storage.foldername(name))[1] IN (
      SELECT firm_id::text FROM user_profiles WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "firm_documents_storage_insert"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'firm-documents'
    AND (storage.foldername(name))[1] IN (
      SELECT firm_id::text FROM user_profiles
      WHERE user_id = auth.uid()
      AND role IN ('mlro', 'admin', 'platform_admin')
    )
  );

CREATE POLICY "firm_documents_storage_delete"
  ON storage.objects FOR DELETE
  TO authenticated
  USING (
    bucket_id = 'firm-documents'
    AND (storage.foldername(name))[1] IN (
      SELECT firm_id::text FROM user_profiles
      WHERE user_id = auth.uid()
      AND role IN ('mlro', 'admin', 'platform_admin')
    )
  );
