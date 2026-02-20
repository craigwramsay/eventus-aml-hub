-- CDD Progress Tracking + Per-item Evidence Linking
-- Adds completion tracking for individual CDD checklist items
-- and links evidence records to specific CDD actions.

-- 1. Add action_id to assessment_evidence (nullable = assessment-level evidence)
ALTER TABLE assessment_evidence ADD COLUMN action_id text;

-- Index for filtering evidence by action
CREATE INDEX idx_evidence_action ON assessment_evidence(assessment_id, action_id);

-- 2. CDD item progress table
CREATE TABLE cdd_item_progress (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  firm_id uuid NOT NULL REFERENCES firms(id),
  assessment_id uuid NOT NULL REFERENCES assessments(id),
  action_id text NOT NULL,
  completed_at timestamptz,
  completed_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (assessment_id, action_id)
);

CREATE INDEX idx_cdd_progress_assessment ON cdd_item_progress(assessment_id);

-- RLS
ALTER TABLE cdd_item_progress ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view progress for their firm"
  ON cdd_item_progress FOR SELECT
  USING (firm_id = (SELECT firm_id FROM user_profiles WHERE user_id = auth.uid()));

CREATE POLICY "Users can insert progress for their firm"
  ON cdd_item_progress FOR INSERT
  WITH CHECK (firm_id = (SELECT firm_id FROM user_profiles WHERE user_id = auth.uid()));

CREATE POLICY "Users can update progress for their firm"
  ON cdd_item_progress FOR UPDATE
  USING (firm_id = (SELECT firm_id FROM user_profiles WHERE user_id = auth.uid()));
