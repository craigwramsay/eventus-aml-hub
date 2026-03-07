/**
 * Clio Token Management
 *
 * Reusable helper to get a valid Clio access token for a firm.
 * Reads from firm_integrations, refreshes if expired, and updates DB.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { refreshClioToken } from './client';

const TOKEN_BUFFER_MS = 5 * 60 * 1000; // 5-minute buffer before expiry

/**
 * Get a valid Clio access token for a firm.
 * Returns null if Clio is not connected for this firm.
 * Refreshes the token automatically if expired or about to expire.
 */
export async function getClioAccessTokenForFirm(
  supabase: SupabaseClient,
  firmId: string
): Promise<{ accessToken: string; integrationId: string } | null> {
  const { data: integration } = await supabase
    .from('firm_integrations')
    .select('id, access_token, refresh_token, token_expires_at')
    .eq('firm_id', firmId)
    .eq('provider', 'clio')
    .single();

  if (!integration?.access_token || !integration.refresh_token) {
    return null;
  }

  // Check if token needs refreshing
  const expiresAt = integration.token_expires_at
    ? new Date(integration.token_expires_at).getTime()
    : 0;
  const needsRefresh = Date.now() >= expiresAt - TOKEN_BUFFER_MS;

  if (!needsRefresh) {
    return {
      accessToken: integration.access_token,
      integrationId: integration.id,
    };
  }

  // Refresh the token
  const tokens = await refreshClioToken(integration.refresh_token);
  const newExpiresAt = new Date(Date.now() + tokens.expires_in * 1000).toISOString();

  await supabase
    .from('firm_integrations')
    .update({
      access_token: tokens.access_token,
      refresh_token: tokens.refresh_token,
      token_expires_at: newExpiresAt,
      updated_at: new Date().toISOString(),
    })
    .eq('id', integration.id);

  return {
    accessToken: tokens.access_token,
    integrationId: integration.id,
  };
}
