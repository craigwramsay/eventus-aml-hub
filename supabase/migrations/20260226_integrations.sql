-- Migration: Clio + Amiqus Integration Tables
-- Adds firm_integrations, amiqus_verifications, and SECURITY DEFINER RPCs for webhook processing.

-- Enable pgcrypto for HMAC computation
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- ────────────────────────────────────────────────────────
-- Table: firm_integrations
-- Stores per-firm OAuth tokens and webhook config for Clio/Amiqus.
-- ────────────────────────────────────────────────────────

CREATE TABLE firm_integrations (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  firm_id       uuid NOT NULL REFERENCES firms(id) ON DELETE CASCADE,
  provider      text NOT NULL CHECK (provider IN ('clio', 'amiqus')),
  access_token  text,
  refresh_token text,
  token_expires_at timestamptz,
  webhook_id    text,
  webhook_secret text,
  webhook_expires_at timestamptz,
  config        jsonb DEFAULT '{}'::jsonb,
  connected_at  timestamptz DEFAULT now(),
  connected_by  uuid,
  created_at    timestamptz DEFAULT now(),
  updated_at    timestamptz DEFAULT now(),
  UNIQUE(firm_id, provider)
);

ALTER TABLE firm_integrations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "firm_integrations_select" ON firm_integrations
  FOR SELECT USING (firm_id = (SELECT firm_id FROM user_profiles WHERE user_id = auth.uid()));

CREATE POLICY "firm_integrations_insert" ON firm_integrations
  FOR INSERT WITH CHECK (firm_id = (SELECT firm_id FROM user_profiles WHERE user_id = auth.uid()));

CREATE POLICY "firm_integrations_update" ON firm_integrations
  FOR UPDATE USING (firm_id = (SELECT firm_id FROM user_profiles WHERE user_id = auth.uid()));

CREATE POLICY "firm_integrations_delete" ON firm_integrations
  FOR DELETE USING (firm_id = (SELECT firm_id FROM user_profiles WHERE user_id = auth.uid()));

-- ────────────────────────────────────────────────────────
-- Table: amiqus_verifications
-- Tracks Amiqus verification records linked to assessments.
-- ────────────────────────────────────────────────────────

CREATE TABLE amiqus_verifications (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  firm_id         uuid NOT NULL REFERENCES firms(id) ON DELETE CASCADE,
  assessment_id   uuid NOT NULL REFERENCES assessments(id) ON DELETE CASCADE,
  action_id       text NOT NULL,
  amiqus_record_id integer,
  amiqus_client_id integer,
  status          text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'in_progress', 'complete', 'failed', 'expired')),
  perform_url     text,
  verified_at     date,
  created_by      uuid,
  created_at      timestamptz DEFAULT now(),
  updated_at      timestamptz DEFAULT now()
);

ALTER TABLE amiqus_verifications ENABLE ROW LEVEL SECURITY;

CREATE POLICY "amiqus_verifications_select" ON amiqus_verifications
  FOR SELECT USING (firm_id = (SELECT firm_id FROM user_profiles WHERE user_id = auth.uid()));

CREATE POLICY "amiqus_verifications_insert" ON amiqus_verifications
  FOR INSERT WITH CHECK (firm_id = (SELECT firm_id FROM user_profiles WHERE user_id = auth.uid()));

CREATE POLICY "amiqus_verifications_update" ON amiqus_verifications
  FOR UPDATE USING (firm_id = (SELECT firm_id FROM user_profiles WHERE user_id = auth.uid()));

-- Index for webhook lookups by amiqus_record_id
CREATE INDEX idx_amiqus_verifications_record_id ON amiqus_verifications(amiqus_record_id) WHERE amiqus_record_id IS NOT NULL;

-- ────────────────────────────────────────────────────────
-- Column: matters.clio_matter_id
-- Links hub matters to Clio matter IDs for deduplication.
-- ────────────────────────────────────────────────────────

ALTER TABLE matters ADD COLUMN IF NOT EXISTS clio_matter_id text;

CREATE UNIQUE INDEX IF NOT EXISTS idx_matters_clio_matter_id
  ON matters(clio_matter_id) WHERE clio_matter_id IS NOT NULL;

-- ────────────────────────────────────────────────────────
-- RPC: verify_clio_webhook
-- SECURITY DEFINER — verifies HMAC-SHA256 signature against stored secrets.
-- Returns firm_id + access_token on match.
-- ────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION verify_clio_webhook(
  p_signature text,
  p_body text
)
RETURNS TABLE(firm_id uuid, access_token text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  r RECORD;
  computed_hmac text;
BEGIN
  FOR r IN
    SELECT fi.firm_id, fi.access_token, fi.webhook_secret
    FROM firm_integrations fi
    WHERE fi.provider = 'clio'
      AND fi.webhook_secret IS NOT NULL
  LOOP
    computed_hmac := encode(
      hmac(p_body::bytea, r.webhook_secret::bytea, 'sha256'),
      'hex'
    );
    IF computed_hmac = p_signature THEN
      firm_id := r.firm_id;
      access_token := r.access_token;
      RETURN NEXT;
      RETURN;
    END IF;
  END LOOP;
  -- No match found — return empty
END;
$$;

-- ────────────────────────────────────────────────────────
-- RPC: process_clio_webhook
-- SECURITY DEFINER — creates/finds client + matter from Clio data.
-- ────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION process_clio_webhook(
  p_firm_id uuid,
  p_clio_matter_id text,
  p_matter_display_number text,
  p_matter_description text,
  p_clio_contact_id text,
  p_contact_name text,
  p_contact_type text,
  p_user_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_client_id uuid;
  v_matter_id uuid;
  v_entity_type text;
  v_client_type text;
BEGIN
  -- Map Clio contact type to hub entity/client types
  IF lower(p_contact_type) = 'person' THEN
    v_entity_type := 'individual';
    v_client_type := 'individual';
  ELSE
    v_entity_type := 'corporate';
    v_client_type := 'corporate';
  END IF;

  -- Find or create client by clio_contact_id
  SELECT id INTO v_client_id
  FROM clients
  WHERE firm_id = p_firm_id AND clio_contact_id = p_clio_contact_id;

  IF v_client_id IS NULL THEN
    INSERT INTO clients (firm_id, name, entity_type, client_type, sector, clio_contact_id)
    VALUES (p_firm_id, p_contact_name, v_entity_type, v_client_type, 'general', p_clio_contact_id)
    RETURNING id INTO v_client_id;
  END IF;

  -- Check if matter already exists
  SELECT id INTO v_matter_id
  FROM matters
  WHERE firm_id = p_firm_id AND clio_matter_id = p_clio_matter_id;

  IF v_matter_id IS NULL THEN
    INSERT INTO matters (firm_id, client_id, reference, description, status, clio_matter_id)
    VALUES (
      p_firm_id,
      v_client_id,
      COALESCE(p_matter_display_number, 'CLIO-' || p_clio_matter_id),
      p_matter_description,
      'open',
      p_clio_matter_id
    )
    RETURNING id INTO v_matter_id;
  END IF;

  -- Audit event
  INSERT INTO audit_events (firm_id, entity_type, entity_id, action, metadata, created_by)
  VALUES (
    p_firm_id,
    'matter',
    v_matter_id::text,
    'clio_webhook_sync',
    jsonb_build_object(
      'clio_matter_id', p_clio_matter_id,
      'clio_contact_id', p_clio_contact_id,
      'contact_name', p_contact_name
    ),
    COALESCE(p_user_id, '00000000-0000-0000-0000-000000000000')
  );

  RETURN jsonb_build_object(
    'client_id', v_client_id,
    'matter_id', v_matter_id
  );
END;
$$;

-- ────────────────────────────────────────────────────────
-- RPC: verify_amiqus_webhook
-- SECURITY DEFINER — verifies base64-encoded HMAC-SHA256 signature.
-- ────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION verify_amiqus_webhook(
  p_signature text,
  p_body text
)
RETURNS TABLE(firm_id uuid)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  r RECORD;
  computed_hmac text;
BEGIN
  FOR r IN
    SELECT fi.firm_id, fi.webhook_secret
    FROM firm_integrations fi
    WHERE fi.provider = 'amiqus'
      AND fi.webhook_secret IS NOT NULL
  LOOP
    computed_hmac := encode(
      hmac(p_body::bytea, r.webhook_secret::bytea, 'sha256'),
      'base64'
    );
    IF computed_hmac = p_signature THEN
      firm_id := r.firm_id;
      RETURN NEXT;
      RETURN;
    END IF;
  END LOOP;
  -- No match found — return empty
END;
$$;

-- ────────────────────────────────────────────────────────
-- RPC: process_amiqus_webhook
-- SECURITY DEFINER — updates verification status and creates evidence on completion.
-- ────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION process_amiqus_webhook(
  p_firm_id uuid,
  p_amiqus_record_id integer,
  p_status text,
  p_verified_at date DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_verification RECORD;
  v_evidence_id uuid;
  v_client_id uuid;
BEGIN
  -- Find the verification record
  SELECT * INTO v_verification
  FROM amiqus_verifications
  WHERE firm_id = p_firm_id AND amiqus_record_id = p_amiqus_record_id
  LIMIT 1;

  IF v_verification IS NULL THEN
    RETURN jsonb_build_object('error', 'Verification record not found');
  END IF;

  -- Update verification status
  UPDATE amiqus_verifications
  SET status = p_status,
      verified_at = CASE WHEN p_status = 'complete' THEN COALESCE(p_verified_at, CURRENT_DATE) ELSE verified_at END,
      updated_at = now()
  WHERE id = v_verification.id;

  -- On completion, create evidence row and update client CDD date
  IF p_status = 'complete' THEN
    INSERT INTO assessment_evidence (
      firm_id, assessment_id, action_id, evidence_type, label, source, data, created_by
    )
    VALUES (
      p_firm_id,
      v_verification.assessment_id,
      v_verification.action_id,
      'amiqus',
      'Amiqus Identity Verification',
      'Amiqus',
      jsonb_build_object(
        'amiqus_record_id', p_amiqus_record_id,
        'verified_at', COALESCE(p_verified_at, CURRENT_DATE)::text
      ),
      COALESCE(v_verification.created_by, '00000000-0000-0000-0000-000000000000')
    )
    RETURNING id INTO v_evidence_id;

    -- Update client CDD date: assessment -> matter -> client
    SELECT m.client_id INTO v_client_id
    FROM assessments a
    JOIN matters m ON m.id = a.matter_id
    WHERE a.id = v_verification.assessment_id;

    IF v_client_id IS NOT NULL THEN
      UPDATE clients
      SET last_cdd_verified_at = COALESCE(p_verified_at, CURRENT_DATE)::text
      WHERE id = v_client_id
        AND (last_cdd_verified_at IS NULL OR last_cdd_verified_at < COALESCE(p_verified_at, CURRENT_DATE)::text);
    END IF;

    -- Audit event
    INSERT INTO audit_events (firm_id, entity_type, entity_id, action, metadata, created_by)
    VALUES (
      p_firm_id,
      'assessment_evidence',
      COALESCE(v_evidence_id::text, v_verification.id::text),
      'amiqus_verification_complete',
      jsonb_build_object(
        'amiqus_record_id', p_amiqus_record_id,
        'assessment_id', v_verification.assessment_id,
        'action_id', v_verification.action_id
      ),
      COALESCE(v_verification.created_by, '00000000-0000-0000-0000-000000000000')
    );
  END IF;

  RETURN jsonb_build_object(
    'verification_id', v_verification.id,
    'status', p_status,
    'evidence_id', v_evidence_id
  );
END;
$$;
