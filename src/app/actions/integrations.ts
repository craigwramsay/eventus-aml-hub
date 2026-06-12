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
import {
  deleteClioWebhook,
  listClioWebhooks,
  registerClioWebhook,
  refreshClioToken,
  ClioError,
} from '@/lib/clio';
import { getClioAccessTokenForFirm } from '@/lib/clio/token';
import {
  getAmiqusApiKey,
  registerAmiqusWebhook,
  deleteAmiqusWebhook,
  listAmiqusWebhooks,
  getAmiqusRaw,
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
        /** Top-level keys of the raw record/case response */
        responseKeys?: string[];
        /** Truncated JSON dump of the raw record/case response */
        rawSnippet?: string;
        /** Raw client response (when client_id was found) */
        clientResponse?: { keys: string[]; rawSnippet: string } | { error: string; statusCode?: number };
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
        ['client (number)', () => obj.client],
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
      type ClientResponseShape = NonNullable<
        Extract<TestAmiqusConnectionResult['recordTest'], { ok: true }>['clientResponse']
      >;
      let clientResponse: ClientResponseShape | undefined;

      if (clientId > 0) {
        const clientFetch = await tryFetchRaw(`/clients/${clientId}`);
        if ('raw' in clientFetch) {
          const clientObj = (clientFetch.raw && typeof clientFetch.raw === 'object')
            ? clientFetch.raw as Record<string, unknown>
            : {};
          clientResponse = {
            keys: Object.keys(clientObj),
            rawSnippet: JSON.stringify(clientFetch.raw, null, 2).slice(0, 800),
          };
          // Extract the name. Handles every shape we've seen Amiqus return:
          //   - top-level `name` as plain string
          //   - top-level `full_name` / `first_name` / `last_name`
          //   - nested `name: { full_name }` / `name: { first_name, last_name }`
          //   - nested `name: { first, last }` (older shape)
          const trimOrEmpty = (v: unknown) => (typeof v === 'string' ? v.trim() : '');
          const nameField = clientObj.name;
          if (typeof nameField === 'string' && nameField.trim()) {
            clientName = nameField.trim();
          } else if (nameField && typeof nameField === 'object') {
            const n = nameField as Record<string, unknown>;
            const fullName = trimOrEmpty(n.full_name) || trimOrEmpty(n.name);
            if (fullName) {
              clientName = fullName;
            } else {
              const newShape = [n.first_name, n.middle_name, n.last_name]
                .map(trimOrEmpty).filter(Boolean).join(' ');
              const oldShape = [n.first, n.last].map(trimOrEmpty).filter(Boolean).join(' ');
              clientName = newShape || oldShape || null;
            }
          } else {
            const fallback = trimOrEmpty(clientObj.full_name)
              || [clientObj.first_name, clientObj.last_name].map(trimOrEmpty).filter(Boolean).join(' ');
            if (fallback) clientName = fallback;
          }
        } else {
          const e = clientFetch.err;
          const statusCode = e instanceof AmiqusError ? e.statusCode : undefined;
          clientResponse = { error: e.message, statusCode };
        }
      }

      result.recordTest = {
        ok: true,
        type: type!,
        clientId,
        clientName,
        responseKeys,
        rawSnippet,
        clientResponse,
      };
    }

    return { success: true, result };
  } catch (err) {
    console.error('Error in testAmiqusConnection:', err);
    return { success: false, error: err instanceof Error ? err.message : 'Unknown error' };
  }
}

/**
 * Diagnostic: test the Clio integration end-to-end.
 *
 * Reports on four independent things so we can pinpoint why webhook events
 * aren't reaching the Hub:
 *   1. Server-side env vars (CLIO_CLIENT_ID, CLIO_CLIENT_SECRET, NEXT_PUBLIC_APP_URL).
 *   2. Stored row state — presence of webhook id/secret/expiry; never returns the secret itself.
 *   3. Access token validity — calls getClioAccessTokenForFirm, which refreshes if expired.
 *   4. Live API check — GET /webhooks.json, look up our stored ID, confirm URL/events/expiry.
 */
export interface TestClioConnectionResult {
  envVars: {
    clientIdConfigured: boolean;
    clientSecretConfigured: boolean;
    appUrlConfigured: boolean;
    appUrl: string | null;
  };
  integration: {
    exists: boolean;
    webhookIdStored: string | null;
    webhookSecretStored: boolean;
    storedWebhookExpiresAt: string | null;
    storedWebhookDaysLeft: number | null;
    tokenExpiresAt: string | null;
  };
  tokenTest:
    | { ok: true; refreshed: boolean }
    | { ok: false; error: string };
  webhookListTest?:
    | {
        ok: true;
        totalWebhooks: number;
        storedWebhookFound: boolean;
        liveWebhook?: {
          url: string;
          model: string;
          events: string[];
          expiresAt: string | null;
          urlMatchesExpected: boolean;
          expectedUrl: string;
          daysUntilExpiry: number | null;
        };
      }
    | { ok: false; error: string; statusCode?: number };
}

function daysFromNow(iso: string | null | undefined): number | null {
  if (!iso) return null;
  return Math.ceil((new Date(iso).getTime() - Date.now()) / (1000 * 60 * 60 * 24));
}

export async function testClioConnection(): Promise<
  { success: true; result: TestClioConnectionResult } | { success: false; error: string }
> {
  try {
    const { supabase, user, profile, error } = await getUserAndProfile();
    if (error || !user || !profile) {
      return { success: false, error: error || 'Not authenticated' };
    }

    if (!canManageIntegrations(profile.role as UserRole)) {
      return { success: false, error: 'Insufficient permissions' };
    }

    const appUrl = process.env.NEXT_PUBLIC_APP_URL || null;
    const result: TestClioConnectionResult = {
      envVars: {
        clientIdConfigured: !!process.env.CLIO_CLIENT_ID,
        clientSecretConfigured: !!process.env.CLIO_CLIENT_SECRET,
        appUrlConfigured: !!appUrl,
        appUrl,
      },
      integration: {
        exists: false,
        webhookIdStored: null,
        webhookSecretStored: false,
        storedWebhookExpiresAt: null,
        storedWebhookDaysLeft: null,
        tokenExpiresAt: null,
      },
      tokenTest: { ok: false, error: 'Not run' },
    };

    const { data: integration } = await supabase
      .from('firm_integrations')
      .select(
        'id, access_token, refresh_token, token_expires_at, webhook_id, webhook_secret, webhook_expires_at'
      )
      .eq('firm_id', profile.firm_id)
      .eq('provider', 'clio')
      .maybeSingle();

    if (!integration) {
      result.tokenTest = { ok: false, error: 'Clio is not connected for this firm' };
      return { success: true, result };
    }

    const typed = integration as Pick<
      FirmIntegration,
      | 'id'
      | 'access_token'
      | 'refresh_token'
      | 'token_expires_at'
      | 'webhook_id'
      | 'webhook_secret'
      | 'webhook_expires_at'
    >;

    result.integration = {
      exists: true,
      webhookIdStored: typed.webhook_id || null,
      webhookSecretStored: !!typed.webhook_secret,
      storedWebhookExpiresAt: typed.webhook_expires_at || null,
      storedWebhookDaysLeft: daysFromNow(typed.webhook_expires_at),
      tokenExpiresAt: typed.token_expires_at || null,
    };

    // Token refresh check — getClioAccessTokenForFirm refreshes if expired
    const tokenWasExpired = typed.token_expires_at
      ? new Date(typed.token_expires_at).getTime() <= Date.now() + 5 * 60 * 1000
      : true;

    let accessToken: string | null = null;
    try {
      const tokenResult = await getClioAccessTokenForFirm(supabase, profile.firm_id);
      if (tokenResult) {
        accessToken = tokenResult.accessToken;
        result.tokenTest = { ok: true, refreshed: tokenWasExpired };
      } else {
        result.tokenTest = { ok: false, error: 'No access/refresh token stored — reconnect Clio' };
      }
    } catch (err) {
      result.tokenTest = {
        ok: false,
        error: err instanceof Error ? err.message : 'Unknown error',
      };
    }

    if (!accessToken) {
      return { success: true, result };
    }

    // Live webhook list test
    try {
      const list = await listClioWebhooks(accessToken);
      const expectedUrl = `${appUrl || ''}/api/webhooks/clio`;
      const storedId = typed.webhook_id;

      let storedWebhookFound = false;
      let liveWebhook:
        | NonNullable<Extract<TestClioConnectionResult['webhookListTest'], { ok: true }>['liveWebhook']>
        | undefined;

      if (storedId) {
        const match = list.data.find((w) => String(w.id) === storedId);
        if (match) {
          storedWebhookFound = true;
          const expiresAt = match.expires_at ?? match.expired_at ?? null;
          liveWebhook = {
            url: match.url,
            model: match.model,
            events: match.events,
            expiresAt,
            urlMatchesExpected: !!appUrl && match.url === expectedUrl,
            expectedUrl,
            daysUntilExpiry: daysFromNow(expiresAt),
          };
        }
      }

      result.webhookListTest = {
        ok: true,
        totalWebhooks: list.data.length,
        storedWebhookFound,
        liveWebhook,
      };
    } catch (err) {
      const statusCode = err instanceof ClioError ? err.statusCode : undefined;
      result.webhookListTest = {
        ok: false,
        error: err instanceof Error ? err.message : 'Unknown error',
        statusCode,
      };
    }

    return { success: true, result };
  } catch (err) {
    console.error('Error in testClioConnection:', err);
    return { success: false, error: err instanceof Error ? err.message : 'Unknown error' };
  }
}
