-- RPC for cron-based Clio webhook renewal.
-- Returns all Clio integrations with webhooks expiring within 2 days,
-- and provides an update function for the cron to save renewed webhook details.

-- Get all Clio integrations whose webhooks expire within a given threshold
CREATE OR REPLACE FUNCTION get_expiring_clio_webhooks(p_hours_threshold integer DEFAULT 48)
RETURNS TABLE(
  integration_id uuid,
  firm_id uuid,
  access_token text,
  refresh_token text,
  token_expires_at timestamptz,
  webhook_id text,
  webhook_expires_at timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT
    fi.id AS integration_id,
    fi.firm_id,
    fi.access_token,
    fi.refresh_token,
    fi.token_expires_at::timestamptz,
    fi.webhook_id,
    fi.webhook_expires_at::timestamptz
  FROM firm_integrations fi
  WHERE fi.provider = 'clio'
    AND fi.webhook_id IS NOT NULL
    AND fi.access_token IS NOT NULL
    AND fi.webhook_expires_at IS NOT NULL
    AND fi.webhook_expires_at::timestamptz <= (now() + (p_hours_threshold || ' hours')::interval);
END;
$$;

-- Update a firm's webhook details after renewal
CREATE OR REPLACE FUNCTION update_clio_webhook(
  p_integration_id uuid,
  p_webhook_id text,
  p_webhook_secret text,
  p_webhook_expires_at text,
  p_access_token text DEFAULT NULL,
  p_refresh_token text DEFAULT NULL,
  p_token_expires_at text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE firm_integrations
  SET
    webhook_id = p_webhook_id,
    webhook_secret = p_webhook_secret,
    webhook_expires_at = p_webhook_expires_at,
    access_token = COALESCE(p_access_token, access_token),
    refresh_token = COALESCE(p_refresh_token, refresh_token),
    token_expires_at = COALESCE(p_token_expires_at, token_expires_at),
    updated_at = now()
  WHERE id = p_integration_id;
END;
$$;
