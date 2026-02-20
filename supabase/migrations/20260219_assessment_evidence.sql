-- Assessment Evidence table
-- Append-only storage for verification evidence (CH reports, file uploads, manual records)

CREATE TABLE assessment_evidence (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  firm_id uuid NOT NULL REFERENCES firms(id),
  assessment_id uuid NOT NULL REFERENCES assessments(id),
  evidence_type text NOT NULL,    -- 'companies_house', 'file_upload', 'amiqus', 'manual_record'
  label text NOT NULL,            -- Human-readable label e.g. "Companies House Report - 12345678"
  source text,                    -- 'Companies House', 'Amiqus', 'Manual'
  data jsonb,                     -- Structured data (CH API response, Amiqus data, etc.)
  file_path text,                 -- Supabase Storage path (null for API-sourced evidence)
  file_name text,                 -- Original filename
  file_size integer,              -- Bytes
  notes text,                     -- Free-text notes from solicitor
  created_by uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Indexes
CREATE INDEX idx_evidence_assessment ON assessment_evidence(assessment_id);
CREATE INDEX idx_evidence_firm ON assessment_evidence(firm_id);

-- RLS
ALTER TABLE assessment_evidence ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view evidence for their firm"
  ON assessment_evidence FOR SELECT
  USING (firm_id = (SELECT firm_id FROM user_profiles WHERE user_id = auth.uid()));

CREATE POLICY "Users can insert evidence for their firm"
  ON assessment_evidence FOR INSERT
  WITH CHECK (firm_id = (SELECT firm_id FROM user_profiles WHERE user_id = auth.uid()));

-- No UPDATE or DELETE policies — evidence is append-only
