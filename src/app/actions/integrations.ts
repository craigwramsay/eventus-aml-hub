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
import {
  getAmiqusApiKey,
  registerAmiqusWebhook,
  deleteAmiqusWebhook,
  listAmiqusWebhooks,
  getAmiqusRaw,
  getAmiqusClient,
  formatAmiqusClientName,
  AmiqusError,
} from '@/lib/amiqus';

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

    if (provider === 'amiqus' && typedIntegration.webhook_id) {
      const apiKey = getAmiqusApiKey();
      if (apiKey) {
        try {
          await deleteAmiqusWebhook(typedIntegration.webhook_id, apiKey);
        } catch (err) {
          // Non-fatal — webhook may have already been deactivated
          if (err instanceof AmiqusError) {
            console.warn('Failed to delete Amiqus webhook:', err.message);
          }
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
      if (handshakeSecret) {
        webhookSecret = handshakeSecret;
      } else {
        const { data: pendingSecret } = await supabase.rpc(
          'get_clio_webhook_handshake',
          { p_webhook_id: 'pending' }
        );
        if (pendingSecret) webhookSecret = pendingSecret;
      }
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

/**
 * Register (or re-register) the Amiqus webhook for the current firm.
 *
 * If an existing webhook is stored, attempts to delete it from Amiqus first
 * (ignoring errors — the old webhook may already be deactivated). Then
 * registers a new webhook and stores the new ID and secret in firm_integrations.
 *
 * Also creates a firm_integrations row if one doesn't exist yet.
 */
export async function registerAmiqusWebhookForFirm(): Promise<DisconnectResult> {
  try {
    const { supabase, user, profile, error } = await getUserAndProfile();
    if (error || !user || !profile) {
      return { success: false, error: error || 'Not authenticated' };
    }

    if (!canManageIntegrations(profile.role as UserRole)) {
      return { success: false, error: 'Insufficient permissions' };
    }

    const apiKey = getAmiqusApiKey();
    if (!apiKey) {
      return { success: false, error: 'Amiqus API key not configured' };
    }

    const appUrl = process.env.NEXT_PUBLIC_APP_URL;
    if (!appUrl) {
      return { success: false, error: 'NEXT_PUBLIC_APP_URL not configured' };
    }

    // Get existing integration (if any)
    const { data: existing } = await supabase
      .from('firm_integrations')
      .select('*')
      .eq('firm_id', profile.firm_id)
      .eq('provider', 'amiqus')
      .maybeSingle();

    const existingIntegration = existing as FirmIntegration | null;

    // Delete old webhook (ignore errors)
    if (existingIntegration?.webhook_id) {
      try {
        await deleteAmiqusWebhook(existingIntegration.webhook_id, apiKey);
      } catch (err) {
        if (err instanceof AmiqusError) {
          console.warn('Failed to delete old Amiqus webhook (continuing):', err.message);
        }
      }
    }

    // Register new webhook
    const webhookUrl = `${appUrl}/api/webhooks/amiqus`;
    let webhook;
    try {
      webhook = await registerAmiqusWebhook(
        webhookUrl,
        ['record.finished', 'record.updated'],
        apiKey
      );
    } catch (err) {
      if (err instanceof AmiqusError) {
        return { success: false, error: `Failed to register webhook with Amiqus: ${err.message}` };
      }
      throw err;
    }

    // Upsert firm_integrations row
    const now = new Date().toISOString();
    if (existingIntegration) {
      const { error: updateErr } = await supabase
        .from('firm_integrations')
        .update({
          webhook_id: String(webhook.id),
          webhook_secret: webhook.secret,
          updated_at: now,
        })
        .eq('id', existingIntegration.id);

      if (updateErr) {
        console.error('Failed to update Amiqus integration:', updateErr);
        return { success: false, error: 'Webhook registered but failed to save to DB' };
      }
    } else {
      const { error: insertErr } = await supabase
        .from('firm_integrations')
        .insert({
          firm_id: profile.firm_id,
          provider: 'amiqus' as IntegrationProvider,
          webhook_id: String(webhook.id),
          webhook_secret: webhook.secret,
          connected_at: now,
          connected_by: user.id,
          config: {},
        });

      if (insertErr) {
        console.error('Failed to create Amiqus integration:', insertErr);
        return { success: false, error: 'Webhook registered but failed to save to DB' };
      }
    }

    // Audit log
    await supabase.from('audit_events').insert({
      firm_id: profile.firm_id,
      entity_type: 'integration',
      entity_id: 'amiqus',
      action: existingIntegration ? 'amiqus_webhook_renewed' : 'amiqus_webhook_registered',
      metadata: {
        webhook_id: String(webhook.id),
        webhook_url: webhookUrl,
      },
      created_by: user.id,
    });

    return { success: true };
  } catch (err) {
    console.error('Error registering Amiqus webhook:', err);
    return { success: false, error: 'Failed to register webhook' };
  }
}

/**
 * Diagnostic: test the Amiqus integration end-to-end.
 *
 * Reports on three independent things so we can pinpoint why backfill
 * isn't running:
 *   1. Server-side env vars (AMIQUS_API_KEY, NEXT_PUBLIC_APP_URL).
 *   2. Authenticated API call (GET /webhooks) — proves the key is valid.
 *   3. Optionally a record/case lookup + linked client lookup, when the
 *      caller supplies an `amiqusRecordId`. This mirrors exactly what
 *      `backfillAmiqusClientIds` does, so a failure here explains why
 *      the backfill is producing no name updates.
 */
export interface TestAmiqusConnectionResult {
  apiKeyConfigured: boolean;
  appUrlConfigured: boolean;
  apiKeyTail: string | null;
  authTest:
    | { ok: true; webhookCount: number }
    | { ok: false; error: string; statusCode?: number };
  recordTest?:
    | {
        ok: true;
        type: 'record' | 'case';
        clientId: number;
        clientName: string | null;
        /** Top-level keys of the raw response — surfaced so we can find the client_id field if extraction failed */
        responseKeys?: string[];
        /** A short JSON dump of the raw response (truncated) — handy for diagnosing unknown shapes */
        rawSnippet?: string;
      }
    | { ok: false; error: string; statusCode?: number };
}

export async function testAmiqusConnection(
  amiqusRecordId?: number
): Promise<{ success: true; result: TestAmiqusConnectionResult } | { success: false; error: string }> {
  try {
    const { user, profile, error } = await getUserAndProfile();
    if (error || !user || !profile) {
      return { success: false, error: error || 'Not authenticated' };
    }

    if (!canManageIntegrations(profile.role as UserRole)) {
      return { success: false, error: 'Insufficient permissions' };
    }

    const apiKey = getAmiqusApiKey();
    const appUrl = process.env.NEXT_PUBLIC_APP_URL;
    const apiKeyTail = apiKey ? `…${apiKey.slice(-4)}` : null;

    const result: TestAmiqusConnectionResult = {
      apiKeyConfigured: !!apiKey,
      appUrlConfigured: !!appUrl,
      apiKeyTail,
      authTest: { ok: false, error: 'Not run' },
    };

    if (!apiKey) {
      result.authTest = { ok: false, error: 'AMIQUS_API_KEY env var is not set in this environment' };
      return { success: true, result };
    }

    // 2. Auth test — GET /webhooks
    try {
      const webhooks = await listAmiqusWebhooks(apiKey);
      result.authTest = { ok: true, webhookCount: webhooks.length };
    } catch (err) {
      const statusCode = err instanceof AmiqusError ? err.statusCode : undefined;
      const message = err instanceof Error ? err.message : 'Unknown error';
      result.authTest = { ok: false, error: message, statusCode };
      return { success: true, result }; // surface the error rather than throwing
    }

    // 3. Optional record/case lookup when an ID is supplied — uses raw fetch so
    //    the diagnostic can show the actual response shape (which is what we
    //    need to figure out where Amiqus is putting client_id).
    if (amiqusRecordId) {
      const tryFetchRaw = async (path: string): Promise<{ raw: unknown } | { err: AmiqusError | Error }> => {
        try {
          return { raw: await getAmiqusRaw(path, apiKey) };
        } catch (err) {
          return { err: err instanceof Error ? err : new Error('Unknown error') };
        }
      };

      // Try /cases/{id} first, then /records/{id} on 404, matching the existing helper
      let raw: unknown = null;
      let type: 'record' | 'case' | null = null;
      const caseAttempt = await tryFetchRaw(`/cases/${amiqusRecordId}`);
      if ('raw' in caseAttempt) {
        raw = caseAttempt.raw;
        type = 'case';
      } else if (caseAttempt.err instanceof AmiqusError && caseAttempt.err.statusCode === 404) {
        const recordAttempt = await tryFetchRaw(`/records/${amiqusRecordId}`);
        if ('raw' in recordAttempt) {
          raw = recordAttempt.raw;
          type = 'record';
        } else {
          const e = recordAttempt.err;
          const statusCode = e instanceof AmiqusError ? e.statusCode : undefined;
          result.recordTest = { ok: false, error: e.message, statusCode };
          return { success: true, result };
        }
      } else {
        const e = caseAttempt.err;
        const statusCode = e instanceof AmiqusError ? e.statusCode : undefined;
        result.recordTest = { ok: false, error: e.message, statusCode };
        return { success: true, result };
      }

      // Inspect the raw response. Walk a small set of plausible field paths to
      // try to find the linked client id — surface keys + a JSON snippet either
      // way so we can see what's actually there.
      const obj = (raw && typeof raw === 'object') ? raw as Record<string, unknown> : {};
      const responseKeys = Object.keys(obj);
      const rawSnippet = JSON.stringify(raw, null, 2).slice(0, 800);

      const candidatePaths: Array<[string, () => unknown]> = [
        ['client_id', () => obj.client_id],
        ['client.id', () => (obj.client as { id?: unknown } | undefined)?.id],
        ['client.uuid', () => (obj.client as { uuid?: unknown } | undefined)?.uuid],
        ['client_uuid', () => obj.client_uuid],
        ['subject_id', () => obj.subject_id],
        ['subject.id', () => (obj.subject as { id?: unknown } | undefined)?.id],
        ['assignee_id', () => obj.assignee_id],
        ['assignee.id', () => (obj.assignee as { id?: unknown } | undefined)?.id],
      ];
      let clientId = 0;
      let foundVia: string | null = null;
      for (const [path, fn] of candidatePaths) {
        const v = fn();
        if (typeof v === 'number' && v > 0) {
          clientId = v;
          foundVia = path;
          break;
        }
      }

      let clientName: string | null = null;
      if (clientId > 0) {
        try {
          const client = await getAmiqusClient(clientId, apiKey);
          clientName = formatAmiqusClientName(client) || null;
        } catch (err) {
          const statusCode = err instanceof AmiqusError ? err.statusCode : undefined;
          const message = err instanceof Error ? err.message : 'Unknown error';
          result.recordTest = {
            ok: false,
            error: `Found ${type} (client_id from ${foundVia}) but client lookup failed: ${message}`,
            statusCode,
          };
          return { success: true, result };
        }
      }

      result.recordTest = {
        ok: true,
        type: type!,
        clientId,
        clientName,
        responseKeys,
        rawSnippet,
      };
    }

    return { success: true, result };
  } catch (err) {
    console.error('Error in testAmiqusConnection:', err);
    return { success: false, error: err instanceof Error ? err.message : 'Unknown error' };
  }
}
