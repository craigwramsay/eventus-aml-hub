-- MLRO Approval Requests
-- Tracks approval requests and decisions for HIGH risk / EDD assessments.

CREATE TABLE mlro_approval_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  firm_id uuid NOT NULL REFERENCES firms(id),
  assessment_id uuid NOT NULL REFERENCES assessments(id),
  requested_by uuid NOT NULL,
  requested_at timestamptz NOT NULL DEFAULT now(),
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected', 'withdrawn')),
  decision_by uuid,
  decision_at timestamptz,
  decision_notes text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_mlro_approval_assessment ON mlro_approval_requests(assessment_id);
CREATE INDEX idx_mlro_approval_firm_status ON mlro_approval_requests(firm_id, status);

-- RLS
ALTER TABLE mlro_approval_requests ENABLE ROW LEVEL SECURITY;

-- Any firm member can view approval requests for their firm
CREATE POLICY "Users can view approvals for their firm"
  ON mlro_approval_requests FOR SELECT
  USING (firm_id = (SELECT firm_id FROM user_profiles WHERE user_id = auth.uid()));

-- Any firm member can create an approval request
CREATE POLICY "Users can insert approvals for their firm"
  ON mlro_approval_requests FOR INSERT
  WITH CHECK (firm_id = (SELECT firm_id FROM user_profiles WHERE user_id = auth.uid()));

-- MLROs (and admins) can update approval requests for their firm
CREATE POLICY "Users can update approvals for their firm"
  ON mlro_approval_requests FOR UPDATE
  USING (firm_id = (SELECT firm_id FROM user_profiles WHERE user_id = auth.uid()));
