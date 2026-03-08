-- Clio Webhook Handshake Secret Storage
--
-- During webhook registration, Clio sends the shared secret via an X-Hook-Secret
-- header in a handshake POST to our webhook endpoint. This happens BEFORE the
-- webhook creation API call returns, so the callback route can't capture it directly.
--
-- This table temporarily stores the secret during the handshake so the callback
-- route can retrieve it after the registration API call completes.

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

-- Update verify_clio_webhook to try BOTH hex and base64 HMAC encoding.
-- Different Clio regions or API versions may use different encoding.
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
  computed_hmac_hex text;
  computed_hmac_b64 text;
BEGIN
  FOR r IN
    SELECT fi.firm_id, fi.access_token, fi.webhook_secret
    FROM firm_integrations fi
    WHERE fi.provider = 'clio'
      AND fi.webhook_secret IS NOT NULL
  LOOP
    -- Try hex encoding (most common)
    computed_hmac_hex := encode(
      hmac(p_body::bytea, r.webhook_secret::bytea, 'sha256'),
      'hex'
    );
    IF computed_hmac_hex = p_signature THEN
      firm_id := r.firm_id;
      access_token := r.access_token;
      RETURN NEXT;
      RETURN;
    END IF;

    -- Try base64 encoding (alternative)
    computed_hmac_b64 := encode(
      hmac(p_body::bytea, r.webhook_secret::bytea, 'sha256'),
      'base64'
    );
    IF computed_hmac_b64 = p_signature THEN
      firm_id := r.firm_id;
      access_token := r.access_token;
      RETURN NEXT;
      RETURN;
    END IF;
  END LOOP;
  -- No match found — return empty
END;
$$;
