-- Clio Webhook Handshake Secret Storage
--
-- During webhook registration, Clio sends the shared secret via an X-Hook-Secret
-- header in a handshake POST to our webhook endpoint. This happens BEFORE the
-- webhook creation API call returns, so the callback route can't capture it directly.
--
-- This table temporarily stores the secret during the handshake so the callback
-- route can retrieve it after the registration API call completes.

-- Ensure pgcrypto is available (needed for hmac() in verify_clio_webhook)
CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE clio_webhook_handshakes (
  webhook_id text PRIMARY KEY,
  secret     text NOT NULL,
  created_at timestamptz DEFAULT now()
);

-- No RLS needed — only accessed via SECURITY DEFINER RPCs
ALTER TABLE clio_webhook_handshakes ENABLE ROW LEVEL SECURITY;

-- Store the handshake secret (called by webhook handler, no user session)
CREATE OR REPLACE FUNCTION store_clio_webhook_handshake(
  p_webhook_id text,
  p_secret text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO clio_webhook_handshakes (webhook_id, secret)
  VALUES (p_webhook_id, p_secret)
  ON CONFLICT (webhook_id)
  DO UPDATE SET secret = p_secret, created_at = now();
END;
$$;

-- Retrieve the handshake secret (non-destructive for polling support).
-- Cleans up stale records older than 1 hour.
CREATE OR REPLACE FUNCTION get_clio_webhook_handshake(p_webhook_id text)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_secret text;
BEGIN
  SELECT secret INTO v_secret
  FROM clio_webhook_handshakes
  WHERE webhook_id = p_webhook_id;

  -- If found, delete it (consumed)
  IF v_secret IS NOT NULL THEN
    DELETE FROM clio_webhook_handshakes WHERE webhook_id = p_webhook_id;
  END IF;

  -- Clean up any stale handshake records (older than 1 hour)
  DELETE FROM clio_webhook_handshakes WHERE created_at < now() - interval '1 hour';

  RETURN v_secret;
END;
$$;

-- Return Clio integrations with webhook secrets for HMAC verification in app code.
-- HMAC is computed in Node.js (crypto.createHmac) to avoid pgcrypto dependency issues.
CREATE OR REPLACE FUNCTION get_clio_integrations_for_verification()
RETURNS TABLE(firm_id uuid, access_token text, webhook_secret text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
    SELECT fi.firm_id, fi.access_token, fi.webhook_secret
    FROM firm_integrations fi
    WHERE fi.provider = 'clio'
      AND fi.webhook_secret IS NOT NULL;
END;
$$;
