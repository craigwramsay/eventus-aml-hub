'use server';

/**
 * Server Actions for Integration Management
 *
 * Get/disconnect integrations for the settings page.
 * RBAC: mlro, admin, platform_admin only.
 */

import { createClient } from '@/lib/supabase/server';
import type { FirmIntegration, IntegrationProvider } from '@/lib/supabase/types';
import type { UserRole } from '@/lib/auth/roles';
import { canManageIntegrations } from '@/lib/auth/roles';
import { deleteClioWebhook, registerClioWebhook, refreshClioToken, ClioError } from '@/lib/clio';

export type IntegrationStatusResult =
  | { success: true; integrations: FirmIntegration[] }
  | { success: false; error: string };

export type DisconnectResult =
  | { success: true }
  | { success: false; error: string };

/**
 * Fetch authenticated user + profile
 */
async function getUserAndProfile() {
  const supabase = await createClient();

  const {
    data: { user },
    error: userErr,
  } = await supabase.auth.getUser();

  if (userErr || !user) {
    return { supabase, user: null, profile: null, error: 'Not authenticated' };
  }

  const { data: profile, error: profileErr } = await supabase
    .from('user_profiles')
    .select('user_id, firm_id, role')
    .eq('user_id', user.id)
    .single();

  if (profileErr || !profile) {
    return { supabase, user, profile: null, error: 'User profile not found' };
  }

  return { supabase, user, profile, error: null };
}

/**
 * Get integration status for the current firm.
 */
export async function getIntegrationStatus(): Promise<IntegrationStatusResult> {
  try {
    const { supabase, profile, error } = await getUserAndProfile();
    if (error || !profile) {
      return { success: false, error: error || 'Not authenticated' };
    }

    if (!canManageIntegrations(profile.role as UserRole)) {
      return { success: false, error: 'Insufficient permissions' };
    }

    const { data, error: fetchErr } = await supabase
      .from('firm_integrations')
      .select('*')
      .eq('firm_id', profile.firm_id);

    if (fetchErr) {
      console.error('Failed to fetch integrations:', fetchErr);
      return { success: false, error: 'Failed to fetch integration status' };
    }

    return { success: true, integrations: (data || []) as FirmIntegration[] };
  } catch (err) {
    console.error('Error in getIntegrationStatus:', err);
    return { success: false, error: 'An unexpected error occurred' };
  }
}

/**
 * Disconnect an integration (remove tokens, delete webhook).
 */
export async function disconnectIntegration(
  provider: IntegrationProvider
): Promise<DisconnectResult> {
  try {
    const { supabase, user, profile, error } = await getUserAndProfile();
    if (error || !user || !profile) {
      return { success: false, error: error || 'Not authenticated' };
    }

    if (!canManageIntegrations(profile.role as UserRole)) {
      return { success: false, error: 'Insufficient permissions' };
    }

    // Get current integration
    const { data: integration } = await supabase
      .from('firm_integrations')
      .select('*')
      .eq('firm_id', profile.firm_id)
      .eq('provider', provider)
      .single();

    if (!integration) {
      return { success: false, error: 'Integration not found' };
    }

    const typedIntegration = integration as FirmIntegration;

    // Delete webhook from provider if possible
    if (provider === 'clio' && typedIntegration.webhook_id && typedIntegration.access_token) {
      try {
        await deleteClioWebhook(typedIntegration.access_token, typedIntegration.webhook_id);
      } catch (err) {
        // Non-fatal — webhook may have already expired
        if (err instanceof ClioError) {
          console.warn('Failed to delete Clio webhook:', err.message);
        }
      }
    }

    // Delete the integration row
    const { error: deleteErr } = await supabase
      .from('firm_integrations')
      .delete()
      .eq('id', typedIntegration.id);

    if (deleteErr) {
      console.error('Failed to delete integration:', deleteErr);
      return { success: false, error: 'Failed to disconnect integration' };
    }

    // Audit log
    await supabase.from('audit_events').insert({
      firm_id: profile.firm_id,
      entity_type: 'integration',
      entity_id: provider,
      action: `${provider}_disconnected`,
      created_by: user.id,
    });

    return { success: true };
  } catch (err) {
    console.error('Error in disconnectIntegration:', err);
    return { success: false, error: 'An unexpected error occurred' };
  }
}

/**
 * Renew the Clio webhook if it's expiring soon or already expired.
 * Uses stored access token (refreshes if needed), deletes old webhook,
 * registers a new one, and updates the DB row.
 */
export async function renewClioWebhook(): Promise<DisconnectResult> {
  try {
    const { supabase, user, profile, error } = await getUserAndProfile();
    if (error || !user || !profile) {
      return { success: false, error: error || 'Not authenticated' };
    }

    if (!canManageIntegrations(profile.role as UserRole)) {
      return { success: false, error: 'Insufficient permissions' };
    }

    const { data: integration } = await supabase
      .from('firm_integrations')
      .select('*')
      .eq('firm_id', profile.firm_id)
      .eq('provider', 'clio')
      .single();

    if (!integration) {
      return { success: false, error: 'Clio integration not found' };
    }

    const typed = integration as FirmIntegration;
    let accessToken = typed.access_token;

    // Refresh access token if expired
    if (typed.token_expires_at && new Date(typed.token_expires_at) <= new Date()) {
      if (!typed.refresh_token) {
        return { success: false, error: 'No refresh token available. Please reconnect Clio.' };
      }
      const tokens = await refreshClioToken(typed.refresh_token);
      accessToken = tokens.access_token;
      const tokenExpiresAt = new Date(Date.now() + tokens.expires_in * 1000).toISOString();

      await supabase
        .from('firm_integrations')
        .update({
          access_token: tokens.access_token,
          refresh_token: tokens.refresh_token,
          token_expires_at: tokenExpiresAt,
          updated_at: new Date().toISOString(),
        })
        .eq('id', typed.id);
    }

    // Delete old webhook (ignore errors — may have expired)
    if (typed.webhook_id && accessToken) {
      try {
        await deleteClioWebhook(accessToken, typed.webhook_id);
      } catch {
        // Non-fatal
      }
    }

    // Register new webhook
    const webhookUrl = `${process.env.NEXT_PUBLIC_APP_URL}/api/webhooks/clio`;
    const webhook = await registerClioWebhook(accessToken!, webhookUrl, ['created']);

    // Resolve secret: try API response first, then handshake table
    const webhookData = webhook.data as Record<string, unknown>;
    let webhookSecret = webhookData.shared_secret ?? webhookData.secret ?? null;

    if (!webhookSecret) {
      const { data: handshakeSecret } = await supabase.rpc(
        'get_clio_webhook_handshake',
        { p_webhook_id: String(webhook.data.id) }
      );
      if (handshakeSecret) webhookSecret = handshakeSecret;
    }

    const webhookExpiresAt = webhookData.expires_at ?? webhookData.expired_at ?? null;

    // Update DB
    const { error: updateErr } = await supabase
      .from('firm_integrations')
      .update({
        webhook_id: String(webhook.data.id),
        webhook_secret: webhookSecret as string | null,
        webhook_expires_at: webhookExpiresAt as string | null,
        updated_at: new Date().toISOString(),
      })
      .eq('id', typed.id);

    if (updateErr) {
      console.error('Failed to update webhook in DB:', updateErr);
      return { success: false, error: 'Webhook renewed but failed to save' };
    }

    // Audit log
    await supabase.from('audit_events').insert({
      firm_id: profile.firm_id,
      entity_type: 'integration',
      entity_id: 'clio',
      action: 'clio_webhook_renewed',
      metadata: {
        webhook_id: String(webhook.data.id),
        webhook_expires_at: webhookExpiresAt,
      },
      created_by: user.id,
    });

    return { success: true };
  } catch (err) {
    console.error('Error renewing Clio webhook:', err);
    return { success: false, error: 'Failed to renew webhook' };
  }
}
