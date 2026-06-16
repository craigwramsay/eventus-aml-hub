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
  listClioMattersCreatedSince,
  registerClioWebhook,
  refreshClioToken,
  normalizeClientName,
  findFeeVariantMain,
  isStandaloneAdminMatter,
  classifyStandaloneAdminMatter,
  enrichClioImportedClient,
  promoteGenericEntityType,
  fetchClioContact,
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

    // Register new webhook — the registerClioWebhook helper now requests
    // shared_secret and expires_at explicitly in the response.
    const webhookUrl = `${process.env.NEXT_PUBLIC_APP_URL}/api/webhooks/clio`;
    const webhook = await registerClioWebhook(accessToken!, webhookUrl, ['created']);

    // Resolve secret: try API response first; fall back to handshake table.
    // Clio's handshake POST arrives ~1s after the API response, so poll with retries —
    // a single immediate check finds nothing and gets us a null secret (which causes
    // every subsequent webhook to fail HMAC with 401).
    const webhookData = webhook.data as Record<string, unknown>;
    let webhookSecret = webhookData.shared_secret ?? webhookData.secret ?? null;

    if (!webhookSecret) {
      const webhookIdStr = String(webhook.data.id);
      for (let attempt = 0; attempt < 6; attempt++) {
        const { data: byId } = await supabase.rpc('get_clio_webhook_handshake', {
          p_webhook_id: webhookIdStr,
        });
        if (byId) {
          webhookSecret = byId;
          break;
        }
        const { data: byPending } = await supabase.rpc('get_clio_webhook_handshake', {
          p_webhook_id: 'pending',
        });
        if (byPending) {
          webhookSecret = byPending;
          break;
        }
        if (attempt < 5) {
          await new Promise((resolve) => setTimeout(resolve, 500));
        }
      }
      if (!webhookSecret) {
        console.error('Clio renew: no webhook secret found after 3s of handshake polling');
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

/**
 * Backfill clients/matters from Clio that were created while the webhook was
 * broken (or before it existed).
 *
 * v2 matcher: for each Clio matter, before letting the RPC create a fresh
 * client, we look for an existing Hub client with the same NORMALISED name
 * (case-insensitive, Ltd ↔ Limited, trimmed). If exactly one such manual
 * client exists, we set `clio_contact_id` on it so the RPC finds and reuses
 * it instead of creating a duplicate. This avoids the duplicate-client
 * explosion the v1 matcher caused, where every manual client got a parallel
 * Clio-imported copy because matter references didn't match.
 *
 * Per-matter outcomes:
 *   - imported: fresh client + matter created (no existing Hub client matched)
 *   - imported_to_existing_client: an existing manual Hub client matched by
 *     normalised name; we set its clio_contact_id and the RPC then created
 *     the new matter under it. No duplicate client created.
 *   - already_linked: a Hub matter with this clio_matter_id already exists
 *   - manual_duplicate_candidate: a Hub matter's reference exactly equals
 *     this Clio matter's display_number AND the client names match — the
 *     user already manually entered this exact matter. Skip; user reviews.
 *   - multiple_manual_candidates: multiple manual Hub clients match by
 *     normalised name; ambiguous, skip
 *   - error: the RPC or fetch failed
 *
 * dryRun = true returns what WOULD happen without modifying anything —
 * useful for sanity-checking before running for real.
 *
 * For rollback safety: stores `imported_client_ids`, `imported_matter_ids`,
 * and `auto_linked_client_ids` in the audit_events metadata so
 * rollbackLastBackfill can undo precisely what this run did, even if other
 * activity (live webhook events, manual edits) happens in between.
 */
export interface BackfillClioMatterOutcome {
  clioMatterId: string;
  displayNumber: string;
  contactName: string;
  contactId: string;
  status:
    | 'imported'
    | 'imported_to_existing_client'
    | 'already_linked'
    | 'manual_duplicate_candidate'
    | 'multiple_manual_candidates'
    | 'fee_variant_skipped'
    | 'standalone_admin_skipped'
    | 'error';
  /** For manual_duplicate_candidate: the existing Hub matter id+reference that looks like a manual entry. */
  manualMatch?: { matterId: string; reference: string };
  /** For imported_to_existing_client: the existing Hub client id we adopted. */
  adoptedClientId?: string;
  /** For multiple_manual_candidates: how many Hub clients matched. */
  candidateCount?: number;
  /** For fee_variant_skipped: the main matter's description this is a variant of. */
  feeVariantMain?: string;
  /** For standalone_admin_skipped: which category (retainer_folder | payable_by | receivable_from). */
  standaloneAdminCategory?: string;
  error?: string;
}

export interface BackfillClioMattersResult {
  dryRun: boolean;
  sinceISO: string;
  totalFromClio: number;
  imported: number;
  importedToExistingClient: number;
  alreadyLinked: number;
  manualDuplicateCandidates: number;
  multipleManualCandidates: number;
  feeVariantSkipped: number;
  standaloneAdminSkipped: number;
  errors: number;
  cappedAtMax: boolean;
  outcomes: BackfillClioMatterOutcome[];
}

export async function backfillClioMatters(
  sinceISO?: string,
  options: { dryRun?: boolean } = {}
): Promise<{ success: true; result: BackfillClioMattersResult } | { success: false; error: string }> {
  const dryRun = options.dryRun ?? false;
  try {
    const { supabase, user, profile, error } = await getUserAndProfile();
    if (error || !user || !profile) {
      return { success: false, error: error || 'Not authenticated' };
    }
    if (!canManageIntegrations(profile.role as UserRole)) {
      return { success: false, error: 'Insufficient permissions' };
    }

    // Default `since` to the firm's Clio connected_at (i.e. everything since connection)
    let resolvedSince = sinceISO;
    if (!resolvedSince) {
      const { data: integration } = await supabase
        .from('firm_integrations')
        .select('connected_at')
        .eq('firm_id', profile.firm_id)
        .eq('provider', 'clio')
        .maybeSingle();
      resolvedSince = (integration as { connected_at?: string } | null)?.connected_at;
    }
    if (!resolvedSince) {
      return { success: false, error: 'No `since` date supplied and no Clio connection date on file' };
    }

    const tokenResult = await getClioAccessTokenForFirm(supabase, profile.firm_id);
    if (!tokenResult) {
      return { success: false, error: 'Clio is not connected for this firm' };
    }

    // Fetch Clio matters since the date
    const MAX_MATTERS = 500;
    const matters = await listClioMattersCreatedSince(
      tokenResult.accessToken,
      resolvedSince,
      MAX_MATTERS
    );
    const cappedAtMax = matters.length >= MAX_MATTERS;

    // Preload all Hub clients + matters for normalised-name and clio_matter_id lookups
    const { data: hubClients } = await supabase
      .from('clients')
      .select('id, name, clio_contact_id')
      .eq('firm_id', profile.firm_id);

    type HubClientRow = { id: string; name: string; clio_contact_id: string | null };
    const clientRows = (hubClients || []) as HubClientRow[];

    // Index manual (NULL clio_contact_id) Hub clients by normalised name
    const manualClientsByNormName = new Map<string, HubClientRow[]>();
    for (const c of clientRows) {
      if (c.clio_contact_id) continue;
      const key = normalizeClientName(c.name);
      if (!key) continue;
      const bucket = manualClientsByNormName.get(key) ?? [];
      bucket.push(c);
      manualClientsByNormName.set(key, bucket);
    }

    const { data: hubMatters } = await supabase
      .from('matters')
      .select(
        'id, reference, description, clio_matter_id, client_id, clients!matters_client_id_fkey(name, clio_contact_id)'
      )
      .eq('firm_id', profile.firm_id);

    type HubMatterRow = {
      id: string;
      reference: string | null;
      description: string | null;
      clio_matter_id: string | null;
      client_id: string;
      clients:
        | { name: string | null; clio_contact_id: string | null }
        | { name: string | null; clio_contact_id: string | null }[]
        | null;
    };
    const hubMatterRows = (hubMatters || []) as HubMatterRow[];

    const linkedClioMatterIds = new Set(
      hubMatterRows.filter((m) => m.clio_matter_id).map((m) => m.clio_matter_id as string)
    );

    // Snapshot existing client IDs so we can identify NEWLY created ones after backfill
    const preExistingClientIds = new Set(clientRows.map((c) => c.id));

    // Track for audit / rollback
    const autoLinkedClientIds: string[] = [];
    const importedClientIds: string[] = [];
    const importedMatterIds: string[] = [];

    const outcomes: BackfillClioMatterOutcome[] = [];
    let imported = 0;
    let importedToExistingClient = 0;
    let alreadyLinked = 0;
    let manualDuplicateCandidates = 0;
    let multipleManualCandidates = 0;
    let feeVariantSkipped = 0;
    let standaloneAdminSkipped = 0;
    let errors = 0;

    for (const matter of matters) {
      const clioMatterId = String(matter.id);
      const displayNumber = matter.display_number || `CLIO-${clioMatterId}`;
      const contact = matter.client;
      const contactName = contact?.name?.trim() || '';
      const contactId = contact ? String(contact.id) : '';

      if (!contact) {
        outcomes.push({
          clioMatterId,
          displayNumber,
          contactName: '',
          contactId: '',
          status: 'error',
          error: 'Clio matter has no client',
        });
        errors++;
        continue;
      }

      // Already linked?
      if (linkedClioMatterIds.has(clioMatterId)) {
        outcomes.push({
          clioMatterId,
          displayNumber,
          contactName,
          contactId,
          status: 'already_linked',
        });
        alreadyLinked++;
        continue;
      }

      // Standalone-admin skip: pure Clio bookkeeping (Retainer folders,
      // PAYABLE BY, RECEIVABLE FROM) — never enters the Hub.
      if (matter.description && isStandaloneAdminMatter(matter.description)) {
        outcomes.push({
          clioMatterId,
          displayNumber,
          contactName,
          contactId,
          status: 'standalone_admin_skipped',
          standaloneAdminCategory: classifyStandaloneAdminMatter(matter.description) ?? undefined,
        });
        standaloneAdminSkipped++;
        continue;
      }

      // Fee-variant skip: if Clio is sending a sub-matter like
      // "Group restructure 2025 - Interim Fee Note" when "Group restructure 2025"
      // is already in the Hub under the same contact, skip it. Sub-matters exist
      // for Clio's fee tracking and have zero AML value.
      if (matter.description) {
        const sameContactDescriptions = hubMatterRows
          .filter((m) => {
            const clientRel = Array.isArray(m.clients) ? m.clients[0] : m.clients;
            return clientRel?.clio_contact_id === contactId;
          })
          .map((m) => m.description?.trim() || '')
          .filter(Boolean);
        const mainDesc = findFeeVariantMain(matter.description, sameContactDescriptions);
        if (mainDesc) {
          outcomes.push({
            clioMatterId,
            displayNumber,
            contactName,
            contactId,
            status: 'fee_variant_skipped',
            feeVariantMain: mainDesc,
          });
          feeVariantSkipped++;
          continue;
        }
      }

      // Likely-manual duplicate check: Hub matter with same reference AND same client name
      const contactNameLower = contactName.toLowerCase();
      const manualMatch = hubMatterRows.find((m) => {
        if (m.clio_matter_id) return false;
        if (!m.reference || m.reference.trim().toLowerCase() !== displayNumber.trim().toLowerCase()) {
          return false;
        }
        const clientRel = Array.isArray(m.clients) ? m.clients[0] : m.clients;
        const clientName = clientRel?.name?.trim().toLowerCase() || '';
        return clientName === contactNameLower;
      });

      if (manualMatch) {
        outcomes.push({
          clioMatterId,
          displayNumber,
          contactName,
          contactId,
          status: 'manual_duplicate_candidate',
          manualMatch: { matterId: manualMatch.id, reference: manualMatch.reference || '' },
        });
        manualDuplicateCandidates++;
        continue;
      }

      // v2: normalised-name lookup against manual Hub clients
      const normalisedKey = normalizeClientName(contactName);
      const manualCandidates = manualClientsByNormName.get(normalisedKey) ?? [];

      if (manualCandidates.length > 1) {
        outcomes.push({
          clioMatterId,
          displayNumber,
          contactName,
          contactId,
          status: 'multiple_manual_candidates',
          candidateCount: manualCandidates.length,
        });
        multipleManualCandidates++;
        continue;
      }

      let adoptedClientId: string | undefined;

      if (manualCandidates.length === 1) {
        const target = manualCandidates[0];
        adoptedClientId = target.id;

        if (!dryRun) {
          // Set clio_contact_id on the existing manual client. Now the RPC's
          // lookup-by-clio_contact_id will find this client and skip creation.
          const { error: linkErr } = await supabase
            .from('clients')
            .update({ clio_contact_id: contactId })
            .eq('id', target.id);
          if (linkErr) {
            outcomes.push({
              clioMatterId,
              displayNumber,
              contactName,
              contactId,
              status: 'error',
              error: `Auto-link failed: ${linkErr.message}`,
            });
            errors++;
            continue;
          }
          autoLinkedClientIds.push(target.id);
          // Update in-memory index so a subsequent matter for the same contact
          // doesn't trigger another auto-link attempt
          target.clio_contact_id = contactId;
          const bucket = manualClientsByNormName.get(normalisedKey);
          if (bucket) {
            const remaining = bucket.filter((c) => c.id !== target.id);
            if (remaining.length === 0) {
              manualClientsByNormName.delete(normalisedKey);
            } else {
              manualClientsByNormName.set(normalisedKey, remaining);
            }
          }
        }
      }

      if (dryRun) {
        outcomes.push({
          clioMatterId,
          displayNumber,
          contactName,
          contactId,
          status: adoptedClientId ? 'imported_to_existing_client' : 'imported',
          adoptedClientId,
        });
        if (adoptedClientId) importedToExistingClient++;
        else imported++;
        continue;
      }

      // Import via the same RPC the webhook uses
      const { data: rpcData, error: rpcErr } = await supabase.rpc('process_clio_webhook', {
        p_firm_id: profile.firm_id,
        p_clio_matter_id: clioMatterId,
        p_matter_display_number: displayNumber,
        p_matter_description: matter.description || '',
        p_clio_contact_id: contactId,
        p_contact_name: contactName,
        p_contact_type: contact.type || 'Person',
        p_user_id: user.id,
      });

      if (rpcErr) {
        outcomes.push({
          clioMatterId,
          displayNumber,
          contactName,
          contactId,
          status: 'error',
          error: rpcErr.message,
        });
        errors++;
        continue;
      }

      const rpcResult = rpcData as { client_id?: string; matter_id?: string } | null;
      const createdClientId = rpcResult?.client_id;
      const createdMatterId = rpcResult?.matter_id;

      if (createdMatterId) importedMatterIds.push(createdMatterId);
      if (createdClientId && !preExistingClientIds.has(createdClientId)) {
        importedClientIds.push(createdClientId);
        preExistingClientIds.add(createdClientId);
      }

      // Post-import enrichment: promote generic entity_type + Companies House
      // lookup for the just-created client. Non-fatal — log and continue.
      if (createdClientId) {
        try {
          await enrichClioImportedClient(supabase, profile.firm_id, createdClientId);
        } catch (err) {
          console.error('Post-import enrichment failed (non-fatal):', err);
        }
      }

      outcomes.push({
        clioMatterId,
        displayNumber,
        contactName,
        contactId,
        status: adoptedClientId ? 'imported_to_existing_client' : 'imported',
        adoptedClientId,
      });
      if (adoptedClientId) importedToExistingClient++;
      else imported++;
      // Add to linked set so a subsequent duplicate within the same run is treated as already-linked
      linkedClioMatterIds.add(clioMatterId);
    }

    if (!dryRun) {
      await supabase.from('audit_events').insert({
        firm_id: profile.firm_id,
        entity_type: 'integration',
        entity_id: 'clio',
        action: 'clio_backfill_run',
        metadata: {
          since_iso: resolvedSince,
          total_from_clio: matters.length,
          imported,
          imported_to_existing_client: importedToExistingClient,
          already_linked: alreadyLinked,
          manual_duplicate_candidates: manualDuplicateCandidates,
          multiple_manual_candidates: multipleManualCandidates,
          fee_variant_skipped: feeVariantSkipped,
          standalone_admin_skipped: standaloneAdminSkipped,
          errors,
          capped_at_max: cappedAtMax,
          imported_client_ids: importedClientIds,
          imported_matter_ids: importedMatterIds,
          auto_linked_client_ids: autoLinkedClientIds,
        },
        created_by: user.id,
      });
    }

    return {
      success: true,
      result: {
        dryRun,
        sinceISO: resolvedSince,
        totalFromClio: matters.length,
        imported,
        importedToExistingClient,
        alreadyLinked,
        manualDuplicateCandidates,
        multipleManualCandidates,
        feeVariantSkipped,
        standaloneAdminSkipped,
        errors,
        cappedAtMax,
        outcomes,
      },
    };
  } catch (err) {
    console.error('Error in backfillClioMatters:', err);
    return { success: false, error: err instanceof Error ? err.message : 'Unknown error' };
  }
}

/**
 * Roll back the most recent backfill run for this firm.
 *
 * Reads the latest `clio_backfill_run` audit_event for the firm, which
 * (for v2 backfills) records the exact IDs of imported clients, imported
 * matters, and auto-linked existing clients. Then:
 *
 *   1. Delete the imported matters (Postgres FK constraints will reject if
 *      any assessment/evidence/etc. references them — load-bearing safety).
 *   2. Delete the imported clients.
 *   3. NULL out clio_contact_id on the auto-linked existing clients
 *      (restoring them to their pre-backfill manual state).
 *
 * For older (v1) backfill audit events that didn't track IDs, falls back
 * to a heuristic: delete clients with clio_contact_id IS NOT NULL created
 * within a 1-minute window after the audit timestamp and with zero
 * assessments anywhere. The user is shown what would happen and asked to
 * confirm before destructive operations run.
 *
 * Idempotent: re-running after a successful rollback finds nothing to do.
 */
export interface RollbackBackfillResult {
  dryRun: boolean;
  source: 'audit_event' | 'time_window' | 'auto_detect' | 'none';
  backfillTimestamp: string | null;
  /** When source = time_window or auto_detect, the cutoff used. */
  sinceUsed: string | null;
  trackedIds: boolean;
  /** How many clio_backfill_run audit events the firm has total — useful when none are found. */
  auditEventsFound: number;
  /** Any error from the audit_events query. Surface RLS / permission issues. */
  auditQueryError: string | null;
  deletedMatterIds: string[];
  deletedClientIds: string[];
  unlinkedClientIds: string[];
  skipped: Array<{ id: string; type: 'client' | 'matter'; reason: string }>;
}

export async function rollbackLastBackfill(
  options: { dryRun?: boolean; sinceISO?: string } = {}
): Promise<{ success: true; result: RollbackBackfillResult } | { success: false; error: string }> {
  const dryRun = options.dryRun ?? false;
  const sinceISOInput = options.sinceISO?.trim() || null;
  try {
    const { supabase, user, profile, error } = await getUserAndProfile();
    if (error || !user || !profile) {
      return { success: false, error: error || 'Not authenticated' };
    }
    if (!canManageIntegrations(profile.role as UserRole)) {
      return { success: false, error: 'Insufficient permissions' };
    }

    // Find all backfill audit events for this firm so we can report the count even when none match
    const { data: allBackfills, error: auditQueryError } = await supabase
      .from('audit_events')
      .select('id, created_at, metadata')
      .eq('firm_id', profile.firm_id)
      .eq('action', 'clio_backfill_run')
      .order('created_at', { ascending: false });

    const auditEventsFound = (allBackfills || []).length;
    const auditQueryErrorMsg = auditQueryError?.message ?? null;

    type BackfillAudit = {
      id: string;
      created_at: string;
      metadata: {
        imported_client_ids?: string[];
        imported_matter_ids?: string[];
        auto_linked_client_ids?: string[];
      } | null;
    };
    const audit = (allBackfills?.[0] as BackfillAudit | undefined) ?? null;

    let source: 'audit_event' | 'time_window' | 'auto_detect' | 'none' = 'none';
    let backfillTimestamp: string | null = audit?.created_at ?? null;
    let sinceUsed: string | null = null;
    let importedMatterIds: string[] = [];
    let importedClientIds: string[] = [];
    const autoLinkedClientIds: string[] = audit?.metadata?.auto_linked_client_ids ?? [];
    let trackedIds = false;

    if (audit) {
      source = 'audit_event';
      importedMatterIds = [...(audit.metadata?.imported_matter_ids ?? [])];
      importedClientIds = [...(audit.metadata?.imported_client_ids ?? [])];
      trackedIds = importedMatterIds.length > 0 || importedClientIds.length > 0 || autoLinkedClientIds.length > 0;

      if (!trackedIds) {
        // v1 backfill — fall back to heuristic. Conservative: find clients with
        // clio_contact_id created within 1 minute after the backfill audit event.
        const startISO = audit.created_at;
        const endISO = new Date(new Date(audit.created_at).getTime() + 60 * 1000).toISOString();
        const { data: heuristicClients } = await supabase
          .from('clients')
          .select('id')
          .eq('firm_id', profile.firm_id)
          .not('clio_contact_id', 'is', null)
          .gte('created_at', startISO)
          .lte('created_at', endISO);
        const heuristicClientIds = ((heuristicClients || []) as { id: string }[]).map((c) => c.id);

        if (heuristicClientIds.length > 0) {
          const { data: heuristicMatters } = await supabase
            .from('matters')
            .select('id, client_id')
            .eq('firm_id', profile.firm_id)
            .in('client_id', heuristicClientIds);
          const heuristicMatterIds = ((heuristicMatters || []) as { id: string }[]).map((m) => m.id);
          importedMatterIds.push(...heuristicMatterIds);
          importedClientIds.push(...heuristicClientIds);
        }
      }
    } else if (sinceISOInput) {
      source = 'time_window';
      sinceUsed = sinceISOInput;
    } else {
      // Auto-detect: take the most recently created Clio-LINKED MATTER, treat
      // every matter (with clio_matter_id) created within 5 minutes of it as
      // the rollback batch. Matter-based detection catches matters that landed
      // under EXISTING clients (e.g. Morrison's 17 new retainer matters that
      // got added to its already-merged Client 2), which client-based detection
      // would miss.
      const { data: latestMatter } = await supabase
        .from('matters')
        .select('id, created_at')
        .eq('firm_id', profile.firm_id)
        .not('clio_matter_id', 'is', null)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      const latest = latestMatter as { id: string; created_at: string } | null;
      if (latest) {
        const cutoffMs = new Date(latest.created_at).getTime() - 5 * 60 * 1000;
        sinceUsed = new Date(cutoffMs).toISOString();
        source = 'auto_detect';
      }
    }

    // For time_window and auto_detect, populate matter + client IDs from sinceUsed.
    // Query matters with clio_matter_id (rather than clients with clio_contact_id)
    // so we catch matters that landed under existing clients.
    if ((source === 'time_window' || source === 'auto_detect') && sinceUsed) {
      const { data: batchMatters } = await supabase
        .from('matters')
        .select('id, client_id')
        .eq('firm_id', profile.firm_id)
        .not('clio_matter_id', 'is', null)
        .gte('created_at', sinceUsed);
      type BatchMatter = { id: string; client_id: string };
      const batch = (batchMatters || []) as BatchMatter[];
      importedMatterIds = batch.map((m) => m.id);

      // A client is "fully imported" — and therefore safe to delete — only if
      // ALL its matters are in this rollback batch. If it has matters from
      // before the cutoff (pre-existing Hub work), we leave the client alone
      // and only delete the batch matters.
      const clientIdsInBatch = Array.from(new Set(batch.map((m) => m.client_id)));
      if (clientIdsInBatch.length > 0) {
        const { data: allMattersForClients } = await supabase
          .from('matters')
          .select('id, client_id')
          .eq('firm_id', profile.firm_id)
          .in('client_id', clientIdsInBatch);
        const allByClient = new Map<string, number>();
        for (const m of (allMattersForClients || []) as BatchMatter[]) {
          allByClient.set(m.client_id, (allByClient.get(m.client_id) ?? 0) + 1);
        }
        const batchByClient = new Map<string, number>();
        for (const m of batch) {
          batchByClient.set(m.client_id, (batchByClient.get(m.client_id) ?? 0) + 1);
        }
        importedClientIds = clientIdsInBatch.filter(
          (cid) => allByClient.get(cid) === batchByClient.get(cid)
        );
      }
    }

    // If we have no audit event AND no time-window cutoff, return diagnostic
    if (source === 'none') {
      return {
        success: true,
        result: {
          dryRun,
          source,
          backfillTimestamp,
          sinceUsed,
          trackedIds: false,
          auditEventsFound,
          auditQueryError: auditQueryErrorMsg,
          deletedMatterIds: [],
          deletedClientIds: [],
          unlinkedClientIds: [],
          skipped: [],
        },
      };
    }

    const deletedMatterIds: string[] = [];
    const deletedClientIds: string[] = [];
    const unlinkedClientIds: string[] = [];
    const skipped: Array<{ id: string; type: 'client' | 'matter'; reason: string }> = [];

    // Pre-check: assessments on any of the matters we're about to delete
    if (importedMatterIds.length > 0) {
      const { data: blockedAssessments } = await supabase
        .from('assessments')
        .select('matter_id')
        .eq('firm_id', profile.firm_id)
        .in('matter_id', importedMatterIds);
      const blockedSet = new Set(((blockedAssessments || []) as { matter_id: string }[]).map((a) => a.matter_id));

      for (const matterId of importedMatterIds) {
        if (blockedSet.has(matterId)) {
          skipped.push({ id: matterId, type: 'matter', reason: 'Has assessments — rollback would lose work' });
          continue;
        }
        if (!dryRun) {
          const { error: delErr } = await supabase.from('matters').delete().eq('id', matterId);
          if (delErr) {
            skipped.push({ id: matterId, type: 'matter', reason: `Delete failed: ${delErr.message}` });
            continue;
          }
        }
        deletedMatterIds.push(matterId);
      }
    }

    // Delete imported clients (only if no matter still references them after
    // the rollback's matter deletes). In dry-run, matters haven't actually
    // been deleted, so subtract the matters we'd delete from the live count.
    const wouldDeleteMatterSet = new Set(deletedMatterIds);
    for (const clientId of importedClientIds) {
      const { data: refMatters } = await supabase
        .from('matters')
        .select('id')
        .eq('client_id', clientId);
      const refIds = ((refMatters || []) as { id: string }[]).map((m) => m.id);
      const remaining = refIds.filter((id) => !wouldDeleteMatterSet.has(id));
      if (remaining.length > 0) {
        skipped.push({
          id: clientId,
          type: 'client',
          reason: `${remaining.length} matter(s) still reference this client`,
        });
        continue;
      }
      if (!dryRun) {
        const { error: delErr } = await supabase.from('clients').delete().eq('id', clientId);
        if (delErr) {
          skipped.push({ id: clientId, type: 'client', reason: `Delete failed: ${delErr.message}` });
          continue;
        }
      }
      deletedClientIds.push(clientId);
    }

    // Unlink auto-linked existing clients (restore to pre-backfill manual state)
    for (const clientId of autoLinkedClientIds) {
      if (!dryRun) {
        const { error: updErr } = await supabase
          .from('clients')
          .update({ clio_contact_id: null })
          .eq('id', clientId);
        if (updErr) {
          skipped.push({ id: clientId, type: 'client', reason: `Unlink failed: ${updErr.message}` });
          continue;
        }
      }
      unlinkedClientIds.push(clientId);
    }

    if (!dryRun) {
      await supabase.from('audit_events').insert({
        firm_id: profile.firm_id,
        entity_type: 'integration',
        entity_id: 'clio',
        action: 'clio_backfill_rolled_back',
        metadata: {
          source,
          rolled_back_audit_id: audit?.id ?? null,
          backfill_timestamp: backfillTimestamp,
          since_used: sinceUsed,
          deleted_matter_ids: deletedMatterIds,
          deleted_client_ids: deletedClientIds,
          unlinked_client_ids: unlinkedClientIds,
          skipped,
        },
        created_by: user.id,
      });
    }

    return {
      success: true,
      result: {
        dryRun,
        source,
        backfillTimestamp,
        sinceUsed,
        trackedIds,
        auditEventsFound,
        auditQueryError: auditQueryErrorMsg,
        deletedMatterIds,
        deletedClientIds,
        unlinkedClientIds,
        skipped,
      },
    };
  } catch (err) {
    console.error('Error in rollbackLastBackfill:', err);
    return { success: false, error: err instanceof Error ? err.message : 'Unknown error' };
  }
}

/**
 * Delete any Clio webhooks registered against this firm's OAuth credentials
 * that aren't the one we have stored in firm_integrations. These typically
 * come from previous connect attempts where webhook registration succeeded
 * but the row didn't get updated cleanly.
 */
export interface CleanupClioWebhooksResult {
  storedWebhookId: string | null;
  totalWebhooks: number;
  deleted: string[];
  failed: { id: string; error: string }[];
}

export async function cleanupOrphanClioWebhooks(): Promise<
  { success: true; result: CleanupClioWebhooksResult } | { success: false; error: string }
> {
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
      .select('webhook_id')
      .eq('firm_id', profile.firm_id)
      .eq('provider', 'clio')
      .maybeSingle();
    const storedWebhookId = (integration as { webhook_id?: string } | null)?.webhook_id || null;

    const tokenResult = await getClioAccessTokenForFirm(supabase, profile.firm_id);
    if (!tokenResult) {
      return { success: false, error: 'Clio is not connected for this firm' };
    }

    const list = await listClioWebhooks(tokenResult.accessToken);

    const deleted: string[] = [];
    const failed: { id: string; error: string }[] = [];

    for (const webhook of list.data) {
      const id = String(webhook.id);
      if (storedWebhookId && id === storedWebhookId) continue;
      try {
        await deleteClioWebhook(tokenResult.accessToken, id);
        deleted.push(id);
      } catch (err) {
        failed.push({ id, error: err instanceof Error ? err.message : 'Unknown error' });
      }
    }

    if (deleted.length || failed.length) {
      await supabase.from('audit_events').insert({
        firm_id: profile.firm_id,
        entity_type: 'integration',
        entity_id: 'clio',
        action: 'clio_orphan_webhook_cleanup',
        metadata: {
          stored_webhook_id: storedWebhookId,
          total_webhooks: list.data.length,
          deleted,
          failed,
        },
        created_by: user.id,
      });
    }

    return {
      success: true,
      result: {
        storedWebhookId,
        totalWebhooks: list.data.length,
        deleted,
        failed,
      },
    };
  } catch (err) {
    console.error('Error in cleanupOrphanClioWebhooks:', err);
    return { success: false, error: err instanceof Error ? err.message : 'Unknown error' };
  }
}

/**
 * Find and merge duplicate clients/matters where the backfill imported a Clio
 * copy of a record the user had already created manually.
 *
 * Detection: pairs of clients with the SAME name (case-insensitive) where
 *   - one has `clio_contact_id IS NULL` (treated as the "manual" original), and
 *   - the other has `clio_contact_id` set (the Clio-imported copy)
 * Each client must have exactly 1 matter on each side (otherwise the action
 * skips that pair as ambiguous — manual reconciliation needed).
 *
 * Merge strategy (Option A — keep the manual record):
 *   1. Move `clio_matter_id` from the Clio-imported matter onto the manual matter
 *      (releasing the unique index on the imported one first so we don't conflict)
 *   2. Move `clio_contact_id` from the Clio-imported client onto the manual client
 *   3. Repoint any `audit_events.entity_id` pointing at the Clio-imported records
 *      (no FK enforcement on this column) onto the manual records
 *   4. Delete the Clio-imported matter and client. Postgres will REJECT the delete
 *      if any FK reference (assessment, evidence, drive sync, amiqus verification,
 *      cdd progress, mlro approval) was somehow attached to the Clio-imported side —
 *      this is a load-bearing safety net, not paranoia.
 *
 * Pre-merge safety check: count assessments on the Clio-imported matter. If > 0,
 * abort that pair with `skipped_has_assessments` so a human can decide.
 *
 * Not transactional across Postgres statements (Supabase JS doesn't expose
 * transactions), so the steps are ordered to fail safe: an interruption between
 * step 1 and step 4 leaves a recoverable state (both matters NULL on clio_matter_id),
 * and re-running the action picks back up the pairing by client name.
 */
export interface MergeClioDuplicatePairOutcome {
  clientName: string;
  status:
    | 'merged'
    | 'preview_merged'
    | 'skipped_ambiguous'
    | 'skipped_already_merged'
    | 'skipped_has_assessments'
    | 'skipped_unmatched_clients'
    | 'error';
  /** Human-readable reason for skipped/error outcomes */
  reason?: string;
  manualClientId?: string;
  clioImportedClientId?: string;
  manualMatterId?: string;
  clioImportedMatterId?: string;
  manualMatterReference?: string;
  clioImportedMatterReference?: string;
  /** Clio IDs that would be / were copied across */
  clioContactId?: string;
  clioMatterId?: string;
}

export interface MergeClioDuplicatesResult {
  dryRun: boolean;
  pairsFound: number;
  merged: number;
  skippedAmbiguous: number;
  skippedAlreadyMerged: number;
  skippedHasAssessments: number;
  errors: number;
  outcomes: MergeClioDuplicatePairOutcome[];
}

export async function mergeClioImportedDuplicates(
  options: { dryRun?: boolean } = {}
): Promise<
  { success: true; result: MergeClioDuplicatesResult } | { success: false; error: string }
> {
  const dryRun = options.dryRun ?? true;

  try {
    const { supabase, user, profile, error } = await getUserAndProfile();
    if (error || !user || !profile) {
      return { success: false, error: error || 'Not authenticated' };
    }
    if (!canManageIntegrations(profile.role as UserRole)) {
      return { success: false, error: 'Insufficient permissions' };
    }

    // Load all clients for the firm — we group by lowercased name
    const { data: clients, error: clientsErr } = await supabase
      .from('clients')
      .select('id, name, clio_contact_id, created_at')
      .eq('firm_id', profile.firm_id);
    if (clientsErr) return { success: false, error: clientsErr.message };

    type ClientRow = {
      id: string;
      name: string;
      clio_contact_id: string | null;
      created_at: string;
    };
    const rows = (clients || []) as ClientRow[];

    // Group by lowercase name
    const byName = new Map<string, ClientRow[]>();
    for (const c of rows) {
      const key = c.name.trim().toLowerCase();
      if (!key) continue;
      const bucket = byName.get(key) ?? [];
      bucket.push(c);
      byName.set(key, bucket);
    }

    const outcomes: MergeClioDuplicatePairOutcome[] = [];

    for (const [, group] of byName) {
      const withClio = group.filter((c) => c.clio_contact_id);
      const withoutClio = group.filter((c) => !c.clio_contact_id);

      // We only auto-merge unambiguous 1:1 pairings.
      if (withClio.length !== 1 || withoutClio.length !== 1) {
        // Only report if there's at least one of each side — otherwise it's not a duplicate situation
        if (withClio.length > 0 && withoutClio.length > 0) {
          outcomes.push({
            clientName: group[0].name,
            status: 'skipped_unmatched_clients',
            reason: `Found ${withoutClio.length} manual + ${withClio.length} Clio-imported clients with this name; needs manual review`,
          });
        }
        continue;
      }

      const manualClient = withoutClio[0];
      const clioImportedClient = withClio[0];

      // Find matters for both clients
      const { data: manualMatters } = await supabase
        .from('matters')
        .select('id, reference, clio_matter_id')
        .eq('firm_id', profile.firm_id)
        .eq('client_id', manualClient.id);
      const { data: clioMatters } = await supabase
        .from('matters')
        .select('id, reference, clio_matter_id')
        .eq('firm_id', profile.firm_id)
        .eq('client_id', clioImportedClient.id);

      const mList = manualMatters || [];
      const cList = clioMatters || [];

      if (mList.length !== 1 || cList.length !== 1) {
        outcomes.push({
          clientName: manualClient.name,
          status: 'skipped_ambiguous',
          reason: `Manual client has ${mList.length} matter(s), Clio-imported client has ${cList.length} matter(s); only auto-merge 1:1`,
          manualClientId: manualClient.id,
          clioImportedClientId: clioImportedClient.id,
        });
        continue;
      }

      const manualMatter = mList[0] as { id: string; reference: string; clio_matter_id: string | null };
      const clioMatter = cList[0] as { id: string; reference: string; clio_matter_id: string | null };

      // Already merged?
      if (manualMatter.clio_matter_id && !clioMatter.clio_matter_id) {
        outcomes.push({
          clientName: manualClient.name,
          status: 'skipped_already_merged',
          reason: 'Manual matter already has clio_matter_id set',
          manualClientId: manualClient.id,
          clioImportedClientId: clioImportedClient.id,
          manualMatterId: manualMatter.id,
          clioImportedMatterId: clioMatter.id,
        });
        continue;
      }

      // Sanity: manual matter must not already have a Clio link, Clio-imported must
      if (manualMatter.clio_matter_id || !clioMatter.clio_matter_id) {
        outcomes.push({
          clientName: manualClient.name,
          status: 'error',
          reason: `Unexpected matter state — manual.clio_matter_id=${manualMatter.clio_matter_id}, clio.clio_matter_id=${clioMatter.clio_matter_id}`,
          manualClientId: manualClient.id,
          clioImportedClientId: clioImportedClient.id,
          manualMatterId: manualMatter.id,
          clioImportedMatterId: clioMatter.id,
        });
        continue;
      }

      // Pre-merge safety: assessments on the Clio-imported matter mean someone
      // started work on the duplicate — abort that pair, human review needed.
      const { count: assessmentCount } = await supabase
        .from('assessments')
        .select('id', { count: 'exact', head: true })
        .eq('firm_id', profile.firm_id)
        .eq('matter_id', clioMatter.id);

      if (assessmentCount && assessmentCount > 0) {
        outcomes.push({
          clientName: manualClient.name,
          status: 'skipped_has_assessments',
          reason: `${assessmentCount} assessment(s) on the Clio-imported matter — manual review needed`,
          manualClientId: manualClient.id,
          clioImportedClientId: clioImportedClient.id,
          manualMatterId: manualMatter.id,
          clioImportedMatterId: clioMatter.id,
        });
        continue;
      }

      const clioMatterIdValue = clioMatter.clio_matter_id;
      const clioContactIdValue = clioImportedClient.clio_contact_id!;

      if (dryRun) {
        outcomes.push({
          clientName: manualClient.name,
          status: 'preview_merged',
          manualClientId: manualClient.id,
          clioImportedClientId: clioImportedClient.id,
          manualMatterId: manualMatter.id,
          clioImportedMatterId: clioMatter.id,
          manualMatterReference: manualMatter.reference,
          clioImportedMatterReference: clioMatter.reference,
          clioContactId: clioContactIdValue,
          clioMatterId: clioMatterIdValue,
        });
        continue;
      }

      // Execute merge.
      // Step 1: free the unique constraint on clio_matter_id
      const { error: step1Err } = await supabase
        .from('matters')
        .update({ clio_matter_id: null })
        .eq('id', clioMatter.id);
      if (step1Err) {
        outcomes.push({
          clientName: manualClient.name,
          status: 'error',
          reason: `Step 1 (free clio_matter_id) failed: ${step1Err.message}`,
        });
        continue;
      }

      // Step 2: repoint audit_events to manual records (no FK enforcement, so manual sweep)
      await supabase
        .from('audit_events')
        .update({ entity_id: manualMatter.id })
        .eq('firm_id', profile.firm_id)
        .eq('entity_type', 'matter')
        .eq('entity_id', clioMatter.id);
      await supabase
        .from('audit_events')
        .update({ entity_id: manualClient.id })
        .eq('firm_id', profile.firm_id)
        .eq('entity_type', 'client')
        .eq('entity_id', clioImportedClient.id);

      // Step 3: set Clio link on manual records
      const { error: step3aErr } = await supabase
        .from('matters')
        .update({ clio_matter_id: clioMatterIdValue })
        .eq('id', manualMatter.id);
      if (step3aErr) {
        outcomes.push({
          clientName: manualClient.name,
          status: 'error',
          reason: `Step 3a (set clio_matter_id on manual) failed: ${step3aErr.message}`,
        });
        continue;
      }
      const { error: step3bErr } = await supabase
        .from('clients')
        .update({ clio_contact_id: clioContactIdValue })
        .eq('id', manualClient.id);
      if (step3bErr) {
        outcomes.push({
          clientName: manualClient.name,
          status: 'error',
          reason: `Step 3b (set clio_contact_id on manual) failed: ${step3bErr.message}`,
        });
        continue;
      }

      // Step 4: clear clio_contact_id from imported client (in case future unique index gets added)
      await supabase
        .from('clients')
        .update({ clio_contact_id: null })
        .eq('id', clioImportedClient.id);

      // Step 5: delete the Clio-imported matter (Postgres rejects if FKs exist)
      const { error: deleteMatterErr } = await supabase
        .from('matters')
        .delete()
        .eq('id', clioMatter.id);
      if (deleteMatterErr) {
        outcomes.push({
          clientName: manualClient.name,
          status: 'error',
          reason: `Delete imported matter failed (likely FK reference remained): ${deleteMatterErr.message}`,
        });
        continue;
      }

      // Step 6: delete the Clio-imported client
      const { error: deleteClientErr } = await supabase
        .from('clients')
        .delete()
        .eq('id', clioImportedClient.id);
      if (deleteClientErr) {
        outcomes.push({
          clientName: manualClient.name,
          status: 'error',
          reason: `Delete imported client failed (likely FK reference remained): ${deleteClientErr.message}`,
        });
        continue;
      }

      // Audit log per successful merge
      await supabase.from('audit_events').insert({
        firm_id: profile.firm_id,
        entity_type: 'matter',
        entity_id: manualMatter.id,
        action: 'clio_duplicate_merged',
        metadata: {
          deleted_clio_imported_matter_id: clioMatter.id,
          deleted_clio_imported_client_id: clioImportedClient.id,
          adopted_clio_matter_id: clioMatterIdValue,
          adopted_clio_contact_id: clioContactIdValue,
        },
        created_by: user.id,
      });

      outcomes.push({
        clientName: manualClient.name,
        status: 'merged',
        manualClientId: manualClient.id,
        clioImportedClientId: clioImportedClient.id,
        manualMatterId: manualMatter.id,
        clioImportedMatterId: clioMatter.id,
        manualMatterReference: manualMatter.reference,
        clioImportedMatterReference: clioMatter.reference,
        clioContactId: clioContactIdValue,
        clioMatterId: clioMatterIdValue,
      });
    }

    const pairsFound = outcomes.length;
    const merged = outcomes.filter((o) => o.status === 'merged' || o.status === 'preview_merged').length;
    const skippedAmbiguous = outcomes.filter(
      (o) => o.status === 'skipped_ambiguous' || o.status === 'skipped_unmatched_clients'
    ).length;
    const skippedAlreadyMerged = outcomes.filter((o) => o.status === 'skipped_already_merged').length;
    const skippedHasAssessments = outcomes.filter((o) => o.status === 'skipped_has_assessments').length;
    const errors = outcomes.filter((o) => o.status === 'error').length;

    return {
      success: true,
      result: {
        dryRun,
        pairsFound,
        merged,
        skippedAmbiguous,
        skippedAlreadyMerged,
        skippedHasAssessments,
        errors,
        outcomes,
      },
    };
  } catch (err) {
    console.error('Error in mergeClioImportedDuplicates:', err);
    return { success: false, error: err instanceof Error ? err.message : 'Unknown error' };
  }
}

/**
 * Inspect a client by name (case-insensitive contains match).
 *
 * Surfaces DB-level facts that aren't visible in the Hub UI but are needed to
 * plan a manual merge for ambiguous duplicate cases — specifically the
 * presence/absence of `clio_contact_id` on the client and `clio_matter_id`
 * on each matter, plus the assessment count per matter (so we know what
 * work is at stake before deleting anything).
 *
 * Read-only. RBAC: same as the other integration management actions.
 */
export interface InspectedMatter {
  id: string;
  reference: string;
  description: string | null;
  clioMatterId: string | null;
  assessmentCount: number;
  createdAt: string;
}

export interface InspectedClient {
  id: string;
  name: string;
  clioContactId: string | null;
  createdAt: string;
  matters: InspectedMatter[];
}

export interface InspectClientResult {
  query: string;
  totalClientsMatched: number;
  clients: InspectedClient[];
}

export async function inspectClientName(
  clientName: string
): Promise<{ success: true; result: InspectClientResult } | { success: false; error: string }> {
  try {
    const { supabase, user, profile, error } = await getUserAndProfile();
    if (error || !user || !profile) {
      return { success: false, error: error || 'Not authenticated' };
    }
    if (!canManageIntegrations(profile.role as UserRole)) {
      return { success: false, error: 'Insufficient permissions' };
    }

    const trimmed = clientName.trim();
    if (!trimmed) {
      return { success: false, error: 'Client name is required' };
    }

    // Case-insensitive contains; ilike to allow partial matches like "Energisation"
    const { data: clients, error: clientsErr } = await supabase
      .from('clients')
      .select('id, name, clio_contact_id, created_at')
      .eq('firm_id', profile.firm_id)
      .ilike('name', `%${trimmed}%`)
      .order('created_at', { ascending: true });
    if (clientsErr) return { success: false, error: clientsErr.message };

    type ClientRow = {
      id: string;
      name: string;
      clio_contact_id: string | null;
      created_at: string;
    };
    const clientRows = (clients || []) as ClientRow[];

    const inspected: InspectedClient[] = [];
    for (const c of clientRows) {
      // Matters for this client
      const { data: matters } = await supabase
        .from('matters')
        .select('id, reference, description, clio_matter_id, created_at')
        .eq('firm_id', profile.firm_id)
        .eq('client_id', c.id)
        .order('created_at', { ascending: true });

      type MatterRow = {
        id: string;
        reference: string;
        description: string | null;
        clio_matter_id: string | null;
        created_at: string;
      };
      const matterRows = (matters || []) as MatterRow[];

      const inspectedMatters: InspectedMatter[] = [];
      for (const m of matterRows) {
        const { count } = await supabase
          .from('assessments')
          .select('id', { count: 'exact', head: true })
          .eq('firm_id', profile.firm_id)
          .eq('matter_id', m.id);
        inspectedMatters.push({
          id: m.id,
          reference: m.reference,
          description: m.description,
          clioMatterId: m.clio_matter_id,
          assessmentCount: count ?? 0,
          createdAt: m.created_at,
        });
      }

      inspected.push({
        id: c.id,
        name: c.name,
        clioContactId: c.clio_contact_id,
        createdAt: c.created_at,
        matters: inspectedMatters,
      });
    }

    return {
      success: true,
      result: {
        query: trimmed,
        totalClientsMatched: inspected.length,
        clients: inspected,
      },
    };
  } catch (err) {
    console.error('Error in inspectClientName:', err);
    return { success: false, error: err instanceof Error ? err.message : 'Unknown error' };
  }
}

/**
 * Targeted one-shot merges for two specific cases identified via Inspect:
 *
 *   1. Morrison Community Care (Holdco) Limited — Client 1 is Clio-linked
 *      (older, no assessments). Client 2 has 2 finalised assessments. Plan:
 *      reparent Client 1's "Retainer - Andover" matter (which carries a
 *      clio_matter_id) onto Client 2, move clio_contact_id onto Client 2,
 *      delete Client 1's empty duplicate "Drafting NDS" matter, delete Client 1.
 *
 *   2. Energisation Limited — three clients: Client 1 (empty), Client 2 (1
 *      finalised assessment, no Clio link), Client 3 (today's backfill copy
 *      with the Clio link). Plan: move Client 3's clio_matter_id onto Client 2's
 *      matter (same work, both labelled "Investment in Victoria Properties"),
 *      move clio_contact_id onto Client 2, repoint audits, delete Clients 1 + 3
 *      and their matters.
 *
 * Each case has a precondition check up front: if the state doesn't match
 * exactly what Inspect showed at the time of writing, the case is skipped
 * with a clear reason. Re-running after partial execution is safe — the
 * precondition check will see the state has shifted and skip cleanly.
 * Cases are independent; one failing doesn't stop the other.
 *
 * Firm-specific IDs are hardcoded. If a different firm somehow runs this,
 * the preconditions won't match and both cases will be reported as
 * `precondition_mismatch`. After both cases are complete, this action becomes
 * a no-op for everyone — safe to leave in the codebase.
 */

interface MorrisonExpected {
  client1Id: 'cb8f005b-2e8d-476f-a2a7-62fb3536a1c8';
  client2Id: 'a4c8766a-92ae-4707-952a-c4b6d7ad841d';
  client1ClioContactId: '20469964';
  retainerMatterId: '79705b03-9839-410a-bb4f-68a70fbdfb29';
  retainerClioMatterId: '15328433';
  draftingNdsToDeleteId: '7740f40e-07f6-4786-ae68-8f0b6cdef27f';
  draftingNdsToKeepId: '85ec6f62-4a87-4931-962e-9b720bb1f355';
}

const MORRISON: MorrisonExpected = {
  client1Id: 'cb8f005b-2e8d-476f-a2a7-62fb3536a1c8',
  client2Id: 'a4c8766a-92ae-4707-952a-c4b6d7ad841d',
  client1ClioContactId: '20469964',
  retainerMatterId: '79705b03-9839-410a-bb4f-68a70fbdfb29',
  retainerClioMatterId: '15328433',
  draftingNdsToDeleteId: '7740f40e-07f6-4786-ae68-8f0b6cdef27f',
  draftingNdsToKeepId: '85ec6f62-4a87-4931-962e-9b720bb1f355',
};

interface EnergisationExpected {
  client1Id: 'eef65bde-75c2-4c5d-85dc-bcb1c282171c';
  client1MatterId: 'f77c9433-ecc5-4169-b738-94ced6d3508a';
  client2Id: '967a6bd6-a9eb-4b0a-85ae-37a315d442d9';
  client2MatterId: '7a1d3dfa-a8c9-4ab7-a58c-9f5d28c7cf7b';
  client3Id: '8eb4f2b7-4213-4214-bf4e-7364d7633bae';
  client3MatterId: '9a174db5-b19f-4e20-a9fa-f2250903734e';
  client3ClioContactId: '24386564';
  client3ClioMatterId: '15863894';
}

const ENERGISATION: EnergisationExpected = {
  client1Id: 'eef65bde-75c2-4c5d-85dc-bcb1c282171c',
  client1MatterId: 'f77c9433-ecc5-4169-b738-94ced6d3508a',
  client2Id: '967a6bd6-a9eb-4b0a-85ae-37a315d442d9',
  client2MatterId: '7a1d3dfa-a8c9-4ab7-a58c-9f5d28c7cf7b',
  client3Id: '8eb4f2b7-4213-4214-bf4e-7364d7633bae',
  client3MatterId: '9a174db5-b19f-4e20-a9fa-f2250903734e',
  client3ClioContactId: '24386564',
  client3ClioMatterId: '15863894',
};

export interface TargetedMergeCaseOutcome {
  caseName: 'Morrison Community Care (Holdco) Limited' | 'Energisation Limited';
  status: 'merged' | 'precondition_mismatch' | 'error';
  reason?: string;
  steps?: string[];
}

export interface TargetedMergeResult {
  outcomes: TargetedMergeCaseOutcome[];
}

type SupabaseInst = Awaited<ReturnType<typeof createClient>>;

async function executeMorrisonMerge(
  supabase: SupabaseInst,
  firmId: string,
  userId: string
): Promise<TargetedMergeCaseOutcome> {
  const caseName = 'Morrison Community Care (Holdco) Limited' as const;
  const steps: string[] = [];

  // Precondition check
  const { data: client1 } = await supabase
    .from('clients')
    .select('id, clio_contact_id, firm_id')
    .eq('id', MORRISON.client1Id)
    .maybeSingle();
  const { data: client2 } = await supabase
    .from('clients')
    .select('id, clio_contact_id, firm_id')
    .eq('id', MORRISON.client2Id)
    .maybeSingle();
  const { data: retainerMatter } = await supabase
    .from('matters')
    .select('id, client_id, clio_matter_id')
    .eq('id', MORRISON.retainerMatterId)
    .maybeSingle();
  const { data: draftingToDelete } = await supabase
    .from('matters')
    .select('id, client_id, clio_matter_id')
    .eq('id', MORRISON.draftingNdsToDeleteId)
    .maybeSingle();

  const c1 = client1 as { clio_contact_id: string | null; firm_id: string } | null;
  const c2 = client2 as { clio_contact_id: string | null; firm_id: string } | null;
  const rm = retainerMatter as { client_id: string; clio_matter_id: string | null } | null;
  const dd = draftingToDelete as { client_id: string; clio_matter_id: string | null } | null;

  // Already-merged check: Client 1 doesn't exist any more
  if (!c1) {
    return { caseName, status: 'precondition_mismatch', reason: 'Client 1 no longer exists — likely already merged' };
  }

  // Fresh-state check
  if (
    c1.firm_id !== firmId ||
    c1.clio_contact_id !== MORRISON.client1ClioContactId ||
    !c2 ||
    c2.firm_id !== firmId ||
    c2.clio_contact_id !== null ||
    !rm ||
    rm.client_id !== MORRISON.client1Id ||
    rm.clio_matter_id !== MORRISON.retainerClioMatterId ||
    !dd ||
    dd.client_id !== MORRISON.client1Id ||
    dd.clio_matter_id !== null
  ) {
    return {
      caseName,
      status: 'precondition_mismatch',
      reason:
        'State does not match what was observed during Inspect. Re-run Inspect to see current state and re-plan.',
    };
  }

  // Safety: confirm 0 assessments on matters we're deleting
  const { count: ddAssessmentCount } = await supabase
    .from('assessments')
    .select('id', { count: 'exact', head: true })
    .eq('firm_id', firmId)
    .eq('matter_id', MORRISON.draftingNdsToDeleteId);
  if ((ddAssessmentCount ?? 0) !== 0) {
    return {
      caseName,
      status: 'precondition_mismatch',
      reason: `Drafting NDS matter to delete now has ${ddAssessmentCount} assessments — was 0 at plan time. Re-Inspect.`,
    };
  }

  // Execute
  try {
    // 1. Reparent Retainer matter to Client 2
    const { error: e1 } = await supabase
      .from('matters')
      .update({ client_id: MORRISON.client2Id })
      .eq('id', MORRISON.retainerMatterId);
    if (e1) return { caseName, status: 'error', reason: `Reparent Retainer matter failed: ${e1.message}`, steps };
    steps.push('Reparented "Retainer - Andover" matter to Client 2');

    // 2. NULL Client 1's clio_contact_id (clients has no unique index but defensive)
    const { error: e2 } = await supabase
      .from('clients')
      .update({ clio_contact_id: null })
      .eq('id', MORRISON.client1Id);
    if (e2) return { caseName, status: 'error', reason: `Clear Client 1 clio_contact_id failed: ${e2.message}`, steps };
    steps.push('Cleared clio_contact_id from Client 1');

    // 3. SET Client 2.clio_contact_id
    const { error: e3 } = await supabase
      .from('clients')
      .update({ clio_contact_id: MORRISON.client1ClioContactId })
      .eq('id', MORRISON.client2Id);
    if (e3) return { caseName, status: 'error', reason: `Set Client 2 clio_contact_id failed: ${e3.message}`, steps };
    steps.push(`Set clio_contact_id=${MORRISON.client1ClioContactId} on Client 2`);

    // 4. Repoint audit events
    await supabase
      .from('audit_events')
      .update({ entity_id: MORRISON.client2Id })
      .eq('firm_id', firmId)
      .eq('entity_type', 'client')
      .eq('entity_id', MORRISON.client1Id);
    await supabase
      .from('audit_events')
      .update({ entity_id: MORRISON.draftingNdsToKeepId })
      .eq('firm_id', firmId)
      .eq('entity_type', 'matter')
      .eq('entity_id', MORRISON.draftingNdsToDeleteId);
    steps.push('Repointed audit events from Client 1 / dup matter onto survivors');

    // 5. Delete duplicate Drafting NDS matter
    const { error: e5 } = await supabase
      .from('matters')
      .delete()
      .eq('id', MORRISON.draftingNdsToDeleteId);
    if (e5) return { caseName, status: 'error', reason: `Delete dup matter failed (likely FK ref): ${e5.message}`, steps };
    steps.push('Deleted duplicate Drafting NDS matter');

    // 6. Delete Client 1
    const { error: e6 } = await supabase
      .from('clients')
      .delete()
      .eq('id', MORRISON.client1Id);
    if (e6) return { caseName, status: 'error', reason: `Delete Client 1 failed (likely FK ref): ${e6.message}`, steps };
    steps.push('Deleted Client 1');

    // Audit
    await supabase.from('audit_events').insert({
      firm_id: firmId,
      entity_type: 'client',
      entity_id: MORRISON.client2Id,
      action: 'clio_targeted_merge_morrison',
      metadata: MORRISON,
      created_by: userId,
    });

    return { caseName, status: 'merged', steps };
  } catch (err) {
    return {
      caseName,
      status: 'error',
      reason: err instanceof Error ? err.message : 'Unknown error',
      steps,
    };
  }
}

async function executeEnergisationMerge(
  supabase: SupabaseInst,
  firmId: string,
  userId: string
): Promise<TargetedMergeCaseOutcome> {
  const caseName = 'Energisation Limited' as const;
  const steps: string[] = [];

  // Precondition check
  const { data: client1 } = await supabase
    .from('clients').select('id, clio_contact_id, firm_id').eq('id', ENERGISATION.client1Id).maybeSingle();
  const { data: client2 } = await supabase
    .from('clients').select('id, clio_contact_id, firm_id').eq('id', ENERGISATION.client2Id).maybeSingle();
  const { data: client3 } = await supabase
    .from('clients').select('id, clio_contact_id, firm_id').eq('id', ENERGISATION.client3Id).maybeSingle();
  const { data: matter1 } = await supabase
    .from('matters').select('id, client_id, clio_matter_id').eq('id', ENERGISATION.client1MatterId).maybeSingle();
  const { data: matter2 } = await supabase
    .from('matters').select('id, client_id, clio_matter_id').eq('id', ENERGISATION.client2MatterId).maybeSingle();
  const { data: matter3 } = await supabase
    .from('matters').select('id, client_id, clio_matter_id').eq('id', ENERGISATION.client3MatterId).maybeSingle();

  const c1 = client1 as { clio_contact_id: string | null; firm_id: string } | null;
  const c2 = client2 as { clio_contact_id: string | null; firm_id: string } | null;
  const c3 = client3 as { clio_contact_id: string | null; firm_id: string } | null;
  const m1 = matter1 as { client_id: string; clio_matter_id: string | null } | null;
  const m2 = matter2 as { client_id: string; clio_matter_id: string | null } | null;
  const m3 = matter3 as { client_id: string; clio_matter_id: string | null } | null;

  if (!c1 || !c3) {
    return {
      caseName,
      status: 'precondition_mismatch',
      reason: `${!c1 ? 'Client 1' : 'Client 3'} no longer exists — likely already merged`,
    };
  }

  if (
    c1.firm_id !== firmId || c1.clio_contact_id !== null ||
    !c2 || c2.firm_id !== firmId || c2.clio_contact_id !== null ||
    c3.firm_id !== firmId || c3.clio_contact_id !== ENERGISATION.client3ClioContactId ||
    !m1 || m1.client_id !== ENERGISATION.client1Id || m1.clio_matter_id !== null ||
    !m2 || m2.client_id !== ENERGISATION.client2Id || m2.clio_matter_id !== null ||
    !m3 || m3.client_id !== ENERGISATION.client3Id || m3.clio_matter_id !== ENERGISATION.client3ClioMatterId
  ) {
    return {
      caseName,
      status: 'precondition_mismatch',
      reason:
        'State does not match what was observed during Inspect. Re-run Inspect to see current state and re-plan.',
    };
  }

  // Safety: matters being deleted must have 0 assessments
  const { count: m1Assessments } = await supabase
    .from('assessments').select('id', { count: 'exact', head: true })
    .eq('firm_id', firmId).eq('matter_id', ENERGISATION.client1MatterId);
  const { count: m3Assessments } = await supabase
    .from('assessments').select('id', { count: 'exact', head: true })
    .eq('firm_id', firmId).eq('matter_id', ENERGISATION.client3MatterId);
  if ((m1Assessments ?? 0) !== 0 || (m3Assessments ?? 0) !== 0) {
    return {
      caseName,
      status: 'precondition_mismatch',
      reason: `Matters to delete now have assessments (m1=${m1Assessments}, m3=${m3Assessments}) — was 0 at plan time.`,
    };
  }

  try {
    // 1. Free Client 3's matter clio_matter_id (release unique constraint)
    const { error: e1 } = await supabase
      .from('matters').update({ clio_matter_id: null }).eq('id', ENERGISATION.client3MatterId);
    if (e1) return { caseName, status: 'error', reason: `Free clio_matter_id failed: ${e1.message}`, steps };
    steps.push("Cleared clio_matter_id from Client 3's matter");

    // 2. Set on Client 2's matter
    const { error: e2 } = await supabase
      .from('matters').update({ clio_matter_id: ENERGISATION.client3ClioMatterId }).eq('id', ENERGISATION.client2MatterId);
    if (e2) return { caseName, status: 'error', reason: `Set clio_matter_id on m2 failed: ${e2.message}`, steps };
    steps.push(`Set clio_matter_id=${ENERGISATION.client3ClioMatterId} on Client 2's matter`);

    // 3. Move clio_contact_id Client 3 → Client 2
    await supabase.from('clients').update({ clio_contact_id: null }).eq('id', ENERGISATION.client3Id);
    const { error: e3b } = await supabase
      .from('clients').update({ clio_contact_id: ENERGISATION.client3ClioContactId }).eq('id', ENERGISATION.client2Id);
    if (e3b) return { caseName, status: 'error', reason: `Set clio_contact_id on Client 2 failed: ${e3b.message}`, steps };
    steps.push(`Set clio_contact_id=${ENERGISATION.client3ClioContactId} on Client 2`);

    // 4. Repoint audit events from Clients 1 + 3 → Client 2; from m1 + m3 → m2
    for (const fromId of [ENERGISATION.client1Id, ENERGISATION.client3Id]) {
      await supabase.from('audit_events')
        .update({ entity_id: ENERGISATION.client2Id })
        .eq('firm_id', firmId).eq('entity_type', 'client').eq('entity_id', fromId);
    }
    for (const fromId of [ENERGISATION.client1MatterId, ENERGISATION.client3MatterId]) {
      await supabase.from('audit_events')
        .update({ entity_id: ENERGISATION.client2MatterId })
        .eq('firm_id', firmId).eq('entity_type', 'matter').eq('entity_id', fromId);
    }
    steps.push('Repointed audit events from Clients 1+3 and their matters onto Client 2 / its matter');

    // 5. Delete matters (in order: 1 then 3; each will reject if FK exists)
    const { error: e5a } = await supabase.from('matters').delete().eq('id', ENERGISATION.client1MatterId);
    if (e5a) return { caseName, status: 'error', reason: `Delete m1 failed (likely FK): ${e5a.message}`, steps };
    steps.push("Deleted Client 1's matter");

    const { error: e5b } = await supabase.from('matters').delete().eq('id', ENERGISATION.client3MatterId);
    if (e5b) return { caseName, status: 'error', reason: `Delete m3 failed (likely FK): ${e5b.message}`, steps };
    steps.push("Deleted Client 3's matter");

    // 6. Delete clients
    const { error: e6a } = await supabase.from('clients').delete().eq('id', ENERGISATION.client1Id);
    if (e6a) return { caseName, status: 'error', reason: `Delete Client 1 failed: ${e6a.message}`, steps };
    steps.push('Deleted Client 1');
    const { error: e6b } = await supabase.from('clients').delete().eq('id', ENERGISATION.client3Id);
    if (e6b) return { caseName, status: 'error', reason: `Delete Client 3 failed: ${e6b.message}`, steps };
    steps.push('Deleted Client 3');

    await supabase.from('audit_events').insert({
      firm_id: firmId,
      entity_type: 'client',
      entity_id: ENERGISATION.client2Id,
      action: 'clio_targeted_merge_energisation',
      metadata: ENERGISATION,
      created_by: userId,
    });

    return { caseName, status: 'merged', steps };
  } catch (err) {
    return {
      caseName,
      status: 'error',
      reason: err instanceof Error ? err.message : 'Unknown error',
      steps,
    };
  }
}

export async function runTargetedClioMerges(): Promise<
  { success: true; result: TargetedMergeResult } | { success: false; error: string }
> {
  try {
    const { supabase, user, profile, error } = await getUserAndProfile();
    if (error || !user || !profile) return { success: false, error: error || 'Not authenticated' };
    if (!canManageIntegrations(profile.role as UserRole)) {
      return { success: false, error: 'Insufficient permissions' };
    }

    const morrison = await executeMorrisonMerge(supabase, profile.firm_id, user.id);
    const energisation = await executeEnergisationMerge(supabase, profile.firm_id, user.id);

    return { success: true, result: { outcomes: [morrison, energisation] } };
  } catch (err) {
    console.error('Error in runTargetedClioMerges:', err);
    return { success: false, error: err instanceof Error ? err.message : 'Unknown error' };
  }
}

/**
 * Count + list clients that have no Clio link. Useful after merges to see how
 * many "Hub-only" clients exist (likely created before Clio integration was
 * set up, or test/demo entries, or onboarded by someone without Clio access).
 */
export interface UnlinkedClient {
  id: string;
  name: string;
  createdAt: string;
  matterCount: number;
}

export interface ListUnlinkedClientsResult {
  totalUnlinked: number;
  totalClients: number;
  clients: UnlinkedClient[];
}

export async function listUnlinkedClients(): Promise<
  { success: true; result: ListUnlinkedClientsResult } | { success: false; error: string }
> {
  try {
    const { supabase, user, profile, error } = await getUserAndProfile();
    if (error || !user || !profile) return { success: false, error: error || 'Not authenticated' };
    if (!canManageIntegrations(profile.role as UserRole)) {
      return { success: false, error: 'Insufficient permissions' };
    }

    const { count: totalClients } = await supabase
      .from('clients')
      .select('id', { count: 'exact', head: true })
      .eq('firm_id', profile.firm_id);

    const { data: unlinked, error: queryErr } = await supabase
      .from('clients')
      .select('id, name, created_at')
      .eq('firm_id', profile.firm_id)
      .is('clio_contact_id', null)
      .order('created_at', { ascending: true });
    if (queryErr) return { success: false, error: queryErr.message };

    type ClientRow = { id: string; name: string; created_at: string };
    const rows = (unlinked || []) as ClientRow[];

    const clients: UnlinkedClient[] = [];
    for (const c of rows) {
      const { count: matterCount } = await supabase
        .from('matters')
        .select('id', { count: 'exact', head: true })
        .eq('firm_id', profile.firm_id)
        .eq('client_id', c.id);
      clients.push({
        id: c.id,
        name: c.name,
        createdAt: c.created_at,
        matterCount: matterCount ?? 0,
      });
    }

    return {
      success: true,
      result: {
        totalUnlinked: clients.length,
        totalClients: totalClients ?? 0,
        clients,
      },
    };
  } catch (err) {
    console.error('Error in listUnlinkedClients:', err);
    return { success: false, error: err instanceof Error ? err.message : 'Unknown error' };
  }
}

/**
 * Post-backfill cleanup for the firm. Handles the residue from the v2 backfill
 * the user opted into: 4 "not-actually-client" entries to bulk-delete, plus 3
 * middle-name pairs to merge.
 *
 * Bulk delete (Clio-linked clients with these exact names; matters too):
 *   - MILNE ACCOUNTING & BOOKKEEPING LTD (test data on Clio side)
 *   - Craig Ramsay (user's own admin records on Clio)
 *   - Donnie Munro (admin record)
 *   - Client Account Float / Surplus (admin record)
 *
 * Targeted merge (keep manual, link to Clio's contact, reparent matter, delete imported):
 *   - Andrew Goodwin (manual) ← Andrew John Goodwin (Clio)
 *   - Ronald Duncan (manual) ← Ronald James Duncan (Clio)
 *   - Richard Nixon (manual) ← Richard Karl Nixon (Clio)
 *
 * Each case is preconditioned on the current DB state — if anything has shifted
 * (already run, names edited, assessments added to a matter we'd delete), that
 * case is skipped with a clear reason. Cases are independent.
 *
 * Postgres FK constraints back up every delete — anything still referenced
 * fails loud per case.
 */

const CLEANUP_DEBRIS_DELETE_NAMES = [
  'MILNE ACCOUNTING & BOOKKEEPING LTD',
  'Craig Ramsay',
  'Donnie Munro',
  'Client Account Float / Surplus',
];

const CLEANUP_DEBRIS_MERGE_PAIRS: Array<{ manualName: string; clioImportedName: string }> = [
  { manualName: 'Andrew Goodwin', clioImportedName: 'Andrew John Goodwin' },
  { manualName: 'Ronald Duncan', clioImportedName: 'Ronald James Duncan' },
  { manualName: 'Richard Nixon', clioImportedName: 'Richard Karl Nixon' },
];

/**
 * Same-person merges where the Clio-linked client pre-dates the manual one
 * (so we keep the Clio-linked record and reparent the manual's matters onto
 * it). Inverse direction of CLEANUP_DEBRIS_MERGE_PAIRS, used when the user
 * manually re-created a client that already existed as Clio-linked from an
 * earlier webhook event.
 */
const CLEANUP_DEBRIS_KEEP_CLIO_PAIRS: Array<{ keepClioName: string; deleteManualName: string }> = [
  { keepClioName: 'Norman William Innes', deleteManualName: 'Norman Innes' },
  // FWA (Scotland) Limited was auto-linked via v2 backfill (Clio matter 00015 "Loan
  // arrangements with Wright Investments"); the manual entry has a typo ("Limtied")
  // so the normaliser didn't catch the pair.
  { keepClioName: 'FWA (Scotland) Limited', deleteManualName: 'FWA (Scotland) Limtied' },
];

export interface CleanupDebrisCaseOutcome {
  caseName: string;
  caseType: 'bulk_delete' | 'merge_middle_name';
  status: 'done' | 'nothing_to_do' | 'skipped' | 'error';
  reason?: string;
  steps?: string[];
}

export interface CleanupDebrisResult {
  outcomes: CleanupDebrisCaseOutcome[];
}

async function bulkDeleteClioClientsByName(
  supabase: SupabaseInst,
  firmId: string,
  userId: string,
  name: string
): Promise<CleanupDebrisCaseOutcome> {
  const steps: string[] = [];
  const caseName = `Bulk delete: ${name}`;
  const caseType: 'bulk_delete' = 'bulk_delete';

  // Find ALL clients with this name in this firm where clio_contact_id IS NOT NULL.
  // The clio_contact_id requirement ensures we only delete backfill-created
  // records, never manual ones the user might have under the same name.
  const { data: clientsData, error: clientsErr } = await supabase
    .from('clients')
    .select('id')
    .eq('firm_id', firmId)
    .eq('name', name)
    .not('clio_contact_id', 'is', null);
  if (clientsErr) {
    return { caseName, caseType, status: 'error', reason: clientsErr.message };
  }
  const clientIds = ((clientsData || []) as { id: string }[]).map((c) => c.id);
  if (clientIds.length === 0) {
    return { caseName, caseType, status: 'nothing_to_do', reason: 'No Clio-linked clients with this exact name' };
  }

  // Find their matters
  const { data: mattersData } = await supabase
    .from('matters')
    .select('id, client_id')
    .eq('firm_id', firmId)
    .in('client_id', clientIds);
  const matterRows = (mattersData || []) as { id: string; client_id: string }[];
  const matterIds = matterRows.map((m) => m.id);

  // Safety: any assessments on any of these matters?
  if (matterIds.length > 0) {
    const { count: assessmentCount } = await supabase
      .from('assessments')
      .select('id', { count: 'exact', head: true })
      .eq('firm_id', firmId)
      .in('matter_id', matterIds);
    if ((assessmentCount ?? 0) > 0) {
      return {
        caseName,
        caseType,
        status: 'skipped',
        reason: `${assessmentCount} assessment(s) found on these matters — manual review needed`,
      };
    }
  }

  // Delete matters first
  for (const mid of matterIds) {
    const { error: e } = await supabase.from('matters').delete().eq('id', mid);
    if (e) {
      return { caseName, caseType, status: 'error', reason: `Delete matter ${mid} failed: ${e.message}`, steps };
    }
  }
  if (matterIds.length > 0) steps.push(`Deleted ${matterIds.length} matter(s)`);

  // Delete clients
  for (const cid of clientIds) {
    const { error: e } = await supabase.from('clients').delete().eq('id', cid);
    if (e) {
      return { caseName, caseType, status: 'error', reason: `Delete client ${cid} failed: ${e.message}`, steps };
    }
  }
  steps.push(`Deleted ${clientIds.length} client(s)`);

  await supabase.from('audit_events').insert({
    firm_id: firmId,
    entity_type: 'integration',
    entity_id: 'clio',
    action: 'clio_cleanup_bulk_delete',
    metadata: { name, client_ids: clientIds, matter_ids: matterIds },
    created_by: userId,
  });

  return { caseName, caseType, status: 'done', steps };
}

async function mergeMiddleNamePair(
  supabase: SupabaseInst,
  firmId: string,
  userId: string,
  pair: { manualName: string; clioImportedName: string }
): Promise<CleanupDebrisCaseOutcome> {
  const steps: string[] = [];
  const caseName = `Merge: ${pair.manualName} ← ${pair.clioImportedName}`;
  const caseType: 'merge_middle_name' = 'merge_middle_name';

  // Find the manual client (NULL clio_contact_id)
  const { data: manualClients } = await supabase
    .from('clients')
    .select('id, clio_contact_id')
    .eq('firm_id', firmId)
    .eq('name', pair.manualName)
    .is('clio_contact_id', null);
  const manuals = (manualClients || []) as { id: string; clio_contact_id: string | null }[];

  // Find the Clio-imported client (NOT NULL clio_contact_id)
  const { data: clioClients } = await supabase
    .from('clients')
    .select('id, clio_contact_id')
    .eq('firm_id', firmId)
    .eq('name', pair.clioImportedName)
    .not('clio_contact_id', 'is', null);
  const clios = (clioClients || []) as { id: string; clio_contact_id: string }[];

  if (manuals.length === 0 && clios.length === 0) {
    return { caseName, caseType, status: 'nothing_to_do', reason: 'Neither client found — likely already merged' };
  }
  if (manuals.length !== 1 || clios.length !== 1) {
    return {
      caseName,
      caseType,
      status: 'skipped',
      reason: `Expected 1 manual + 1 Clio-imported, found ${manuals.length} manual + ${clios.length} Clio-imported`,
    };
  }

  const manualClient = manuals[0];
  const clioClient = clios[0];
  const clioContactId = clioClient.clio_contact_id;

  // Find the Clio-imported client's matter(s)
  const { data: clioMatters } = await supabase
    .from('matters')
    .select('id, clio_matter_id')
    .eq('firm_id', firmId)
    .eq('client_id', clioClient.id);
  const clioMatterRows = (clioMatters || []) as { id: string; clio_matter_id: string | null }[];

  // Safety: no assessments on the Clio-imported client's matters (we're reparenting, not deleting,
  // but if any matter has an assessment with a different client_id link it could break — defensive)
  if (clioMatterRows.length > 0) {
    const { count: aCount } = await supabase
      .from('assessments')
      .select('id', { count: 'exact', head: true })
      .eq('firm_id', firmId)
      .in('matter_id', clioMatterRows.map((m) => m.id));
    if ((aCount ?? 0) > 0) {
      return {
        caseName,
        caseType,
        status: 'skipped',
        reason: `${aCount} assessment(s) on Clio-imported matters — manual review needed before reparenting`,
      };
    }
  }

  // Step 1: Reparent all Clio-imported matters to manual client
  for (const m of clioMatterRows) {
    const { error: e } = await supabase
      .from('matters')
      .update({ client_id: manualClient.id })
      .eq('id', m.id);
    if (e) {
      return { caseName, caseType, status: 'error', reason: `Reparent matter ${m.id} failed: ${e.message}`, steps };
    }
  }
  steps.push(`Reparented ${clioMatterRows.length} matter(s) to manual client`);

  // Step 2: NULL clio_contact_id on the Clio-imported client (free for transfer)
  const { error: e2 } = await supabase
    .from('clients')
    .update({ clio_contact_id: null })
    .eq('id', clioClient.id);
  if (e2) {
    return { caseName, caseType, status: 'error', reason: `Free clio_contact_id failed: ${e2.message}`, steps };
  }

  // Step 3: SET clio_contact_id on manual client
  const { error: e3 } = await supabase
    .from('clients')
    .update({ clio_contact_id: clioContactId })
    .eq('id', manualClient.id);
  if (e3) {
    return { caseName, caseType, status: 'error', reason: `Set clio_contact_id on manual failed: ${e3.message}`, steps };
  }
  steps.push(`Moved clio_contact_id=${clioContactId} to manual client`);

  // Step 4: Repoint any audit events from the Clio-imported client to manual
  await supabase
    .from('audit_events')
    .update({ entity_id: manualClient.id })
    .eq('firm_id', firmId)
    .eq('entity_type', 'client')
    .eq('entity_id', clioClient.id);

  // Step 5: Delete the now-empty Clio-imported client
  const { error: e5 } = await supabase.from('clients').delete().eq('id', clioClient.id);
  if (e5) {
    return { caseName, caseType, status: 'error', reason: `Delete Clio-imported client failed: ${e5.message}`, steps };
  }
  steps.push(`Deleted Clio-imported client (${pair.clioImportedName})`);

  await supabase.from('audit_events').insert({
    firm_id: firmId,
    entity_type: 'client',
    entity_id: manualClient.id,
    action: 'clio_cleanup_merge_middle_name',
    metadata: {
      manual_name: pair.manualName,
      clio_imported_name: pair.clioImportedName,
      deleted_clio_client_id: clioClient.id,
      adopted_clio_contact_id: clioContactId,
      reparented_matter_count: clioMatterRows.length,
    },
    created_by: userId,
  });

  return { caseName, caseType, status: 'done', steps };
}

async function mergeKeepClioLinked(
  supabase: SupabaseInst,
  firmId: string,
  userId: string,
  pair: { keepClioName: string; deleteManualName: string }
): Promise<CleanupDebrisCaseOutcome> {
  const steps: string[] = [];
  const caseName = `Merge (keep Clio-linked): ${pair.keepClioName} ← ${pair.deleteManualName}`;
  const caseType: 'merge_middle_name' = 'merge_middle_name';

  // Find the manual client to delete (NULL clio_contact_id)
  const { data: manualClients } = await supabase
    .from('clients')
    .select('id')
    .eq('firm_id', firmId)
    .eq('name', pair.deleteManualName)
    .is('clio_contact_id', null);
  const manuals = (manualClients || []) as { id: string }[];

  // Find the Clio-linked client to keep (NOT NULL clio_contact_id)
  const { data: clioClients } = await supabase
    .from('clients')
    .select('id, clio_contact_id')
    .eq('firm_id', firmId)
    .eq('name', pair.keepClioName)
    .not('clio_contact_id', 'is', null);
  const clios = (clioClients || []) as { id: string; clio_contact_id: string }[];

  if (manuals.length === 0 && clios.length === 1) {
    return { caseName, caseType, status: 'nothing_to_do', reason: 'Manual client already absent — likely already merged' };
  }
  if (manuals.length !== 1 || clios.length !== 1) {
    return {
      caseName,
      caseType,
      status: 'skipped',
      reason: `Expected 1 manual + 1 Clio-linked, found ${manuals.length} manual + ${clios.length} Clio-linked`,
    };
  }

  const manualClient = manuals[0];
  const clioClient = clios[0];

  // Reparent the manual client's matters to the Clio-linked client
  const { data: manualMatters } = await supabase
    .from('matters')
    .select('id')
    .eq('firm_id', firmId)
    .eq('client_id', manualClient.id);
  const matterIds = ((manualMatters || []) as { id: string }[]).map((m) => m.id);

  for (const mid of matterIds) {
    const { error: e } = await supabase
      .from('matters')
      .update({ client_id: clioClient.id })
      .eq('id', mid);
    if (e) {
      return { caseName, caseType, status: 'error', reason: `Reparent matter ${mid} failed: ${e.message}`, steps };
    }
  }
  if (matterIds.length > 0) {
    steps.push(`Reparented ${matterIds.length} matter(s) onto Clio-linked client`);
  }

  // Repoint any audit_events from the manual client onto the Clio-linked one
  await supabase
    .from('audit_events')
    .update({ entity_id: clioClient.id })
    .eq('firm_id', firmId)
    .eq('entity_type', 'client')
    .eq('entity_id', manualClient.id);

  // Delete the manual client
  const { error: delErr } = await supabase.from('clients').delete().eq('id', manualClient.id);
  if (delErr) {
    return { caseName, caseType, status: 'error', reason: `Delete manual client failed: ${delErr.message}`, steps };
  }
  steps.push(`Deleted manual client (${pair.deleteManualName})`);

  await supabase.from('audit_events').insert({
    firm_id: firmId,
    entity_type: 'client',
    entity_id: clioClient.id,
    action: 'clio_cleanup_merge_keep_clio',
    metadata: {
      kept_clio_name: pair.keepClioName,
      kept_clio_client_id: clioClient.id,
      deleted_manual_name: pair.deleteManualName,
      deleted_manual_client_id: manualClient.id,
      reparented_matter_count: matterIds.length,
    },
    created_by: userId,
  });

  return { caseName, caseType, status: 'done', steps };
}

export async function cleanupPostBackfillDebris(): Promise<
  { success: true; result: CleanupDebrisResult } | { success: false; error: string }
> {
  try {
    const { supabase, user, profile, error } = await getUserAndProfile();
    if (error || !user || !profile) return { success: false, error: error || 'Not authenticated' };
    if (!canManageIntegrations(profile.role as UserRole)) {
      return { success: false, error: 'Insufficient permissions' };
    }

    const outcomes: CleanupDebrisCaseOutcome[] = [];

    for (const name of CLEANUP_DEBRIS_DELETE_NAMES) {
      outcomes.push(await bulkDeleteClioClientsByName(supabase, profile.firm_id, user.id, name));
    }
    for (const pair of CLEANUP_DEBRIS_MERGE_PAIRS) {
      outcomes.push(await mergeMiddleNamePair(supabase, profile.firm_id, user.id, pair));
    }
    for (const pair of CLEANUP_DEBRIS_KEEP_CLIO_PAIRS) {
      outcomes.push(await mergeKeepClioLinked(supabase, profile.firm_id, user.id, pair));
    }

    return { success: true, result: { outcomes } };
  } catch (err) {
    console.error('Error in cleanupPostBackfillDebris:', err);
    return { success: false, error: err instanceof Error ? err.message : 'Unknown error' };
  }
}

/**
 * Detect and merge duplicate matter pairs that the v2 backfill created.
 *
 * The bug: when v2 backfill auto-linked an existing manual Hub client (because
 * its normalised name matched a Clio contact), the RPC then found that client
 * by clio_contact_id and created a NEW matter under it for each Clio matter
 * the contact had — even when the user's original manual matter (with NULL
 * clio_matter_id) was already a record of the same work.
 *
 * Detection: for each Hub client, look at its matters grouped by description
 * (case-insensitive, trimmed). A pair with one matter having NULL
 * clio_matter_id and another having NOT NULL clio_matter_id is a duplicate.
 *
 * Merge strategy: identical pattern to Energisation's matter merge.
 *   1. NULL clio_matter_id on the Clio-imported matter (releases unique index)
 *   2. SET clio_matter_id on the manual matter
 *   3. Repoint audit_events from the Clio-imported matter onto the manual one
 *   4. DELETE the Clio-imported matter
 *
 * Safety: skip the pair if the Clio-imported matter has ANY assessments —
 * the user might have started work on that one. Skip ambiguous groups
 * (more than one matter on either side with the same description).
 *
 * Postgres FK constraints back up the DELETE — anything we missed (evidence,
 * progress, drive sync, etc.) would reject it loud per pair.
 */
export interface MergeMatterPairOutcome {
  clientId: string;
  clientName: string;
  description: string;
  status: 'merged' | 'preview_merged' | 'skipped_ambiguous' | 'skipped_clio_has_assessments' | 'error';
  reason?: string;
  manualMatterId?: string;
  manualMatterReference?: string;
  clioMatterId?: string;
  clioMatterReference?: string;
  adoptedClioMatterId?: string;
}

export interface MergeDuplicateMattersResult {
  dryRun: boolean;
  pairsFound: number;
  merged: number;
  skippedAmbiguous: number;
  skippedHasAssessments: number;
  errors: number;
  outcomes: MergeMatterPairOutcome[];
}

export async function mergeDuplicateMatterPairs(
  options: { dryRun?: boolean } = {}
): Promise<
  { success: true; result: MergeDuplicateMattersResult } | { success: false; error: string }
> {
  const dryRun = options.dryRun ?? true;
  try {
    const { supabase, user, profile, error } = await getUserAndProfile();
    if (error || !user || !profile) {
      return { success: false, error: error || 'Not authenticated' };
    }
    if (!canManageIntegrations(profile.role as UserRole)) {
      return { success: false, error: 'Insufficient permissions' };
    }

    // Load all matters for the firm
    const { data: matters, error: mattersErr } = await supabase
      .from('matters')
      .select('id, client_id, reference, description, clio_matter_id')
      .eq('firm_id', profile.firm_id);
    if (mattersErr) return { success: false, error: mattersErr.message };

    type MatterRow = {
      id: string;
      client_id: string;
      reference: string;
      description: string | null;
      clio_matter_id: string | null;
    };
    const matterRows = (matters || []) as MatterRow[];

    // Group by client_id + normalised description
    const groups = new Map<string, MatterRow[]>();
    for (const m of matterRows) {
      const desc = (m.description ?? '').trim().toLowerCase();
      if (!desc) continue;
      const key = `${m.client_id}::${desc}`;
      const bucket = groups.get(key) ?? [];
      bucket.push(m);
      groups.set(key, bucket);
    }

    // Load all clients so we can put names in the outcomes
    const clientIdsInPlay = Array.from(new Set(Array.from(groups.values()).flat().map((m) => m.client_id)));
    const clientsById = new Map<string, string>();
    if (clientIdsInPlay.length > 0) {
      const { data: clients } = await supabase
        .from('clients')
        .select('id, name')
        .eq('firm_id', profile.firm_id)
        .in('id', clientIdsInPlay);
      for (const c of (clients || []) as { id: string; name: string }[]) {
        clientsById.set(c.id, c.name);
      }
    }

    const outcomes: MergeMatterPairOutcome[] = [];

    for (const [key, group] of groups) {
      if (group.length < 2) continue;
      const withClio = group.filter((m) => m.clio_matter_id);
      const withoutClio = group.filter((m) => !m.clio_matter_id);
      // Only act on the 1+1 case — anything more ambiguous needs manual review
      if (withClio.length === 0 || withoutClio.length === 0) continue;
      const [clientIdPart, description] = key.split('::');
      const clientName = clientsById.get(clientIdPart) ?? clientIdPart;

      if (withClio.length !== 1 || withoutClio.length !== 1) {
        outcomes.push({
          clientId: clientIdPart,
          clientName,
          description,
          status: 'skipped_ambiguous',
          reason: `Found ${withoutClio.length} manual + ${withClio.length} Clio-imported matters with this description under this client; only auto-merge 1:1`,
        });
        continue;
      }

      const manualMatter = withoutClio[0];
      const clioMatter = withClio[0];

      // Safety: Clio-imported matter must have zero assessments
      const { count: clioAssessmentCount } = await supabase
        .from('assessments')
        .select('id', { count: 'exact', head: true })
        .eq('firm_id', profile.firm_id)
        .eq('matter_id', clioMatter.id);
      if ((clioAssessmentCount ?? 0) > 0) {
        outcomes.push({
          clientId: clientIdPart,
          clientName,
          description,
          status: 'skipped_clio_has_assessments',
          reason: `${clioAssessmentCount} assessment(s) on the Clio-imported matter — manual review needed`,
          manualMatterId: manualMatter.id,
          manualMatterReference: manualMatter.reference,
          clioMatterId: clioMatter.id,
          clioMatterReference: clioMatter.reference,
          adoptedClioMatterId: clioMatter.clio_matter_id!,
        });
        continue;
      }

      if (dryRun) {
        outcomes.push({
          clientId: clientIdPart,
          clientName,
          description,
          status: 'preview_merged',
          manualMatterId: manualMatter.id,
          manualMatterReference: manualMatter.reference,
          clioMatterId: clioMatter.id,
          clioMatterReference: clioMatter.reference,
          adoptedClioMatterId: clioMatter.clio_matter_id!,
        });
        continue;
      }

      const adoptedClioMatterId = clioMatter.clio_matter_id!;

      // Step 1: free the unique index
      const { error: e1 } = await supabase
        .from('matters')
        .update({ clio_matter_id: null })
        .eq('id', clioMatter.id);
      if (e1) {
        outcomes.push({
          clientId: clientIdPart,
          clientName,
          description,
          status: 'error',
          reason: `Free clio_matter_id failed: ${e1.message}`,
        });
        continue;
      }

      // Step 2: set on manual
      const { error: e2 } = await supabase
        .from('matters')
        .update({ clio_matter_id: adoptedClioMatterId })
        .eq('id', manualMatter.id);
      if (e2) {
        outcomes.push({
          clientId: clientIdPart,
          clientName,
          description,
          status: 'error',
          reason: `Set clio_matter_id on manual matter failed: ${e2.message}`,
        });
        continue;
      }

      // Step 3: repoint audit events from Clio-imported matter onto manual
      await supabase
        .from('audit_events')
        .update({ entity_id: manualMatter.id })
        .eq('firm_id', profile.firm_id)
        .eq('entity_type', 'matter')
        .eq('entity_id', clioMatter.id);

      // Step 4: delete Clio-imported matter (Postgres FK rejects if anything still refs it)
      const { error: e4 } = await supabase
        .from('matters')
        .delete()
        .eq('id', clioMatter.id);
      if (e4) {
        outcomes.push({
          clientId: clientIdPart,
          clientName,
          description,
          status: 'error',
          reason: `Delete Clio-imported matter failed (FK reference somewhere?): ${e4.message}`,
        });
        continue;
      }

      // Audit
      await supabase.from('audit_events').insert({
        firm_id: profile.firm_id,
        entity_type: 'matter',
        entity_id: manualMatter.id,
        action: 'duplicate_matter_merged',
        metadata: {
          deleted_clio_imported_matter_id: clioMatter.id,
          adopted_clio_matter_id: adoptedClioMatterId,
          description,
        },
        created_by: user.id,
      });

      outcomes.push({
        clientId: clientIdPart,
        clientName,
        description,
        status: 'merged',
        manualMatterId: manualMatter.id,
        manualMatterReference: manualMatter.reference,
        clioMatterId: clioMatter.id,
        clioMatterReference: clioMatter.reference,
        adoptedClioMatterId,
      });
    }

    const pairsFound = outcomes.length;
    const merged = outcomes.filter((o) => o.status === 'merged' || o.status === 'preview_merged').length;
    const skippedAmbiguous = outcomes.filter((o) => o.status === 'skipped_ambiguous').length;
    const skippedHasAssessments = outcomes.filter((o) => o.status === 'skipped_clio_has_assessments').length;
    const errors = outcomes.filter((o) => o.status === 'error').length;

    return {
      success: true,
      result: { dryRun, pairsFound, merged, skippedAmbiguous, skippedHasAssessments, errors, outcomes },
    };
  } catch (err) {
    console.error('Error in mergeDuplicateMatterPairs:', err);
    return { success: false, error: err instanceof Error ? err.message : 'Unknown error' };
  }
}

/**
 * Detect Clio fee/disbursement sub-matters and (optionally) delete them.
 *
 * Common Clio pattern: when an interim fee is posted on a matter, Clio
 * creates a separate matter to track it. The main matter "Group restructure
 * 2025" gets a companion "Group restructure 2025 - Interim Fee Note". These
 * have their own clio_matter_id and so the backfill correctly imports them,
 * but they have zero AML significance — the underlying work was already
 * assessed under the main matter.
 *
 * Detection — for each pair of matters on the same client:
 *   - main.description (case-insensitive) is a strict prefix of variant.description
 *   - the suffix on variant starts with a dash/separator
 *   - the suffix contains a fee/disbursement/note keyword
 *
 * Action — delete the variant if it has zero assessments. Main is kept as-is.
 *
 * Variant matters have their own Clio matter_id but no AML record value in
 * the Hub. Deleting them simply removes the Hub-side noise; Clio still has
 * them for fee tracking. (No webhook will re-create them since they were
 * already imported — only NEW Clio matter.create events would.)
 */
export interface DeleteFeeVariantOutcome {
  clientId: string;
  clientName: string;
  mainDescription: string;
  variantId: string;
  variantDescription: string;
  variantReference: string;
  status: 'deleted' | 'preview_delete' | 'skipped_has_assessments' | 'error';
  reason?: string;
}

export interface DeleteFeeVariantsResult {
  dryRun: boolean;
  totalCandidates: number;
  deleted: number;
  skippedHasAssessments: number;
  errors: number;
  outcomes: DeleteFeeVariantOutcome[];
}

const FEE_VARIANT_SUFFIX_PATTERN =
  /^[\s\-–—|:·]+(.*\b(interim|final|fee|fees|disbursement|disbursements|note|notes|invoice|payment|costs?)\b)/i;

export async function deleteClioFeeVariantMatters(
  options: { dryRun?: boolean } = {}
): Promise<
  { success: true; result: DeleteFeeVariantsResult } | { success: false; error: string }
> {
  const dryRun = options.dryRun ?? true;
  try {
    const { supabase, user, profile, error } = await getUserAndProfile();
    if (error || !user || !profile) {
      return { success: false, error: error || 'Not authenticated' };
    }
    if (!canManageIntegrations(profile.role as UserRole)) {
      return { success: false, error: 'Insufficient permissions' };
    }

    const { data: matters, error: mattersErr } = await supabase
      .from('matters')
      .select('id, client_id, reference, description')
      .eq('firm_id', profile.firm_id);
    if (mattersErr) return { success: false, error: mattersErr.message };

    type MatterRow = { id: string; client_id: string; reference: string; description: string | null };
    const rows = (matters || []) as MatterRow[];

    // Group by client and detect pairs
    const byClient = new Map<string, MatterRow[]>();
    for (const m of rows) {
      if (!m.description) continue;
      const bucket = byClient.get(m.client_id) ?? [];
      bucket.push(m);
      byClient.set(m.client_id, bucket);
    }

    // Resolve client names
    const clientIds = Array.from(byClient.keys());
    const clientsById = new Map<string, string>();
    if (clientIds.length > 0) {
      const { data: clients } = await supabase
        .from('clients')
        .select('id, name')
        .eq('firm_id', profile.firm_id)
        .in('id', clientIds);
      for (const c of (clients || []) as { id: string; name: string }[]) {
        clientsById.set(c.id, c.name);
      }
    }

    const outcomes: DeleteFeeVariantOutcome[] = [];

    for (const [clientId, clientMatters] of byClient) {
      const clientName = clientsById.get(clientId) ?? clientId;
      for (const variant of clientMatters) {
        const variantDesc = variant.description!.trim();
        const variantLower = variantDesc.toLowerCase();
        // Look for a "main" whose description is a prefix
        const main = clientMatters.find((other) => {
          if (other.id === variant.id) return false;
          const otherDesc = (other.description ?? '').trim();
          if (!otherDesc) return false;
          const otherLower = otherDesc.toLowerCase();
          if (otherLower.length >= variantLower.length) return false;
          if (!variantLower.startsWith(otherLower)) return false;
          const suffix = variantDesc.slice(otherDesc.length);
          return FEE_VARIANT_SUFFIX_PATTERN.test(suffix);
        });
        if (!main) continue;

        // Variant must have zero assessments to be safely deleted
        const { count: assessmentCount } = await supabase
          .from('assessments')
          .select('id', { count: 'exact', head: true })
          .eq('firm_id', profile.firm_id)
          .eq('matter_id', variant.id);

        if ((assessmentCount ?? 0) > 0) {
          outcomes.push({
            clientId,
            clientName,
            mainDescription: main.description!.trim(),
            variantId: variant.id,
            variantDescription: variantDesc,
            variantReference: variant.reference,
            status: 'skipped_has_assessments',
            reason: `${assessmentCount} assessment(s) on this variant — manual review needed`,
          });
          continue;
        }

        if (dryRun) {
          outcomes.push({
            clientId,
            clientName,
            mainDescription: main.description!.trim(),
            variantId: variant.id,
            variantDescription: variantDesc,
            variantReference: variant.reference,
            status: 'preview_delete',
          });
          continue;
        }

        const { error: deleteErr } = await supabase
          .from('matters')
          .delete()
          .eq('id', variant.id);
        if (deleteErr) {
          outcomes.push({
            clientId,
            clientName,
            mainDescription: main.description!.trim(),
            variantId: variant.id,
            variantDescription: variantDesc,
            variantReference: variant.reference,
            status: 'error',
            reason: `Delete failed (FK ref?): ${deleteErr.message}`,
          });
          continue;
        }

        await supabase.from('audit_events').insert({
          firm_id: profile.firm_id,
          entity_type: 'matter',
          entity_id: variant.id,
          action: 'clio_fee_variant_deleted',
          metadata: {
            main_matter_description: main.description!.trim(),
            main_matter_id: main.id,
            variant_description: variantDesc,
            variant_reference: variant.reference,
          },
          created_by: user.id,
        });

        outcomes.push({
          clientId,
          clientName,
          mainDescription: main.description!.trim(),
          variantId: variant.id,
          variantDescription: variantDesc,
          variantReference: variant.reference,
          status: 'deleted',
        });
      }
    }

    const totalCandidates = outcomes.length;
    const deleted = outcomes.filter((o) => o.status === 'deleted' || o.status === 'preview_delete').length;
    const skippedHasAssessments = outcomes.filter((o) => o.status === 'skipped_has_assessments').length;
    const errors = outcomes.filter((o) => o.status === 'error').length;

    return {
      success: true,
      result: { dryRun, totalCandidates, deleted, skippedHasAssessments, errors, outcomes },
    };
  } catch (err) {
    console.error('Error in deleteClioFeeVariantMatters:', err);
    return { success: false, error: err instanceof Error ? err.message : 'Unknown error' };
  }
}

/**
 * Detect + (optionally) delete Clio standalone admin matters already in the
 * Hub: "Retainer - <Location>", "PAYABLE BY X", "RECEIVABLE FROM X".
 *
 * Mirrors deleteClioFeeVariantMatters but uses the standalone-admin pattern
 * (no main-matter-prefix required). Skips matters with assessments.
 */
export interface DeleteStandaloneAdminOutcome {
  clientId: string;
  clientName: string;
  matterId: string;
  matterReference: string;
  matterDescription: string;
  category: string;
  status: 'deleted' | 'preview_delete' | 'skipped_has_assessments' | 'error';
  reason?: string;
}

export interface DeleteStandaloneAdminResult {
  dryRun: boolean;
  totalCandidates: number;
  deleted: number;
  skippedHasAssessments: number;
  errors: number;
  outcomes: DeleteStandaloneAdminOutcome[];
}

export async function deleteClioStandaloneAdminMatters(
  options: { dryRun?: boolean } = {}
): Promise<
  { success: true; result: DeleteStandaloneAdminResult } | { success: false; error: string }
> {
  const dryRun = options.dryRun ?? true;
  try {
    const { supabase, user, profile, error } = await getUserAndProfile();
    if (error || !user || !profile) {
      return { success: false, error: error || 'Not authenticated' };
    }
    if (!canManageIntegrations(profile.role as UserRole)) {
      return { success: false, error: 'Insufficient permissions' };
    }

    const { data: matters, error: mattersErr } = await supabase
      .from('matters')
      .select('id, client_id, reference, description')
      .eq('firm_id', profile.firm_id);
    if (mattersErr) return { success: false, error: mattersErr.message };

    type MatterRow = { id: string; client_id: string; reference: string; description: string | null };
    const rows = (matters || []) as MatterRow[];

    const candidates = rows.filter((m) => m.description && isStandaloneAdminMatter(m.description));

    const clientIds = Array.from(new Set(candidates.map((m) => m.client_id)));
    const clientsById = new Map<string, string>();
    if (clientIds.length > 0) {
      const { data: clients } = await supabase
        .from('clients')
        .select('id, name')
        .eq('firm_id', profile.firm_id)
        .in('id', clientIds);
      for (const c of (clients || []) as { id: string; name: string }[]) {
        clientsById.set(c.id, c.name);
      }
    }

    const outcomes: DeleteStandaloneAdminOutcome[] = [];

    for (const m of candidates) {
      const description = m.description!.trim();
      const clientName = clientsById.get(m.client_id) ?? m.client_id;
      const category = classifyStandaloneAdminMatter(description) ?? 'unknown';

      const { count: assessmentCount } = await supabase
        .from('assessments')
        .select('id', { count: 'exact', head: true })
        .eq('firm_id', profile.firm_id)
        .eq('matter_id', m.id);

      if ((assessmentCount ?? 0) > 0) {
        outcomes.push({
          clientId: m.client_id,
          clientName,
          matterId: m.id,
          matterReference: m.reference,
          matterDescription: description,
          category,
          status: 'skipped_has_assessments',
          reason: `${assessmentCount} assessment(s) — manual review needed`,
        });
        continue;
      }

      if (dryRun) {
        outcomes.push({
          clientId: m.client_id,
          clientName,
          matterId: m.id,
          matterReference: m.reference,
          matterDescription: description,
          category,
          status: 'preview_delete',
        });
        continue;
      }

      const { error: deleteErr } = await supabase.from('matters').delete().eq('id', m.id);
      if (deleteErr) {
        outcomes.push({
          clientId: m.client_id,
          clientName,
          matterId: m.id,
          matterReference: m.reference,
          matterDescription: description,
          category,
          status: 'error',
          reason: `Delete failed (FK ref?): ${deleteErr.message}`,
        });
        continue;
      }

      await supabase.from('audit_events').insert({
        firm_id: profile.firm_id,
        entity_type: 'matter',
        entity_id: m.id,
        action: 'clio_standalone_admin_matter_deleted',
        metadata: {
          category,
          description,
          reference: m.reference,
          client_name: clientName,
        },
        created_by: user.id,
      });

      outcomes.push({
        clientId: m.client_id,
        clientName,
        matterId: m.id,
        matterReference: m.reference,
        matterDescription: description,
        category,
        status: 'deleted',
      });
    }

    const totalCandidates = outcomes.length;
    const deleted = outcomes.filter((o) => o.status === 'deleted' || o.status === 'preview_delete').length;
    const skippedHasAssessments = outcomes.filter((o) => o.status === 'skipped_has_assessments').length;
    const errors = outcomes.filter((o) => o.status === 'error').length;

    return {
      success: true,
      result: { dryRun, totalCandidates, deleted, skippedHasAssessments, errors, outcomes },
    };
  } catch (err) {
    console.error('Error in deleteClioStandaloneAdminMatters:', err);
    return { success: false, error: err instanceof Error ? err.message : 'Unknown error' };
  }
}

/**
 * One-shot cleanups for matters the user identified manually that the
 * automated tools didn't catch.
 *
 * Three "absorb Clio side onto manual" merges where the user specified the
 * keep-matter ID (assessment-bearing) and the source's Clio-format reference.
 * The source matter's clio_matter_id AND reference both move onto the keep
 * matter, then the source is deleted. Different from
 * mergeDuplicateMatterPairs in that it ALSO migrates the reference.
 *
 * Plus one "delete Clio billing matter" — a standalone Clio matter created
 * for fee receivable tracking (e.g. "PAYABLE BY RIBBONWORKS LTD (SC253506)").
 * Fee-variant detector misses these because they don't share a prefix with a
 * main matter; they're entirely standalone Clio entries.
 *
 * Each case is preconditioned. If state doesn't match, the case is skipped —
 * safe to re-run; becomes a no-op once everything's done.
 */
const SPECIFIC_MATTER_MERGES: Array<{
  caseName: string;
  keepMatterId: string;
  sourceClioReference: string;
}> = [
  {
    caseName: 'Trident Maintenance Services Ltd',
    keepMatterId: 'a71c4d56-98af-428d-8fb3-9bf6561ccc0b',
    sourceClioReference:
      'Documenting the share buy backs by Trident Maintenance Services Limited from (i) Grahame Craigs; and (ii) Helen Craigs-00024',
  },
  {
    caseName: 'Hugh McNally',
    keepMatterId: '4be2488e-bc89-460c-aaeb-1786bc762a9d',
    sourceClioReference: 'Advice in respect of loan to Leonard Steel-00026',
  },
  {
    caseName: 'Curtainwise (Scotland) Ltd.',
    keepMatterId: '4e531032-6e83-4ede-8c69-0e1edf6d6d72',
    sourceClioReference: 'VIMBO of Curtainwise (Scotland) Limited-00044',
  },
];

const SPECIFIC_MATTER_DELETES: Array<{
  caseName: string;
  clientName: string;
  matterDescription: string;
}> = [
  {
    caseName: 'Davvic Limited — PAYABLE BY RIBBONWORKS LTD',
    clientName: 'Davvic Limited',
    matterDescription: 'PAYABLE BY RIBBONWORKS LTD (SC253506)',
  },
];

/**
 * One-shot "import this specific Clio matter (by display_number) and merge
 * it onto the keep-matter, adopting its Clio reference + clio_matter_id".
 * For recovering Clio links that were lost in earlier merge operations.
 *
 * Different from SPECIFIC_MATTER_MERGES — that one assumes the source matter
 * already exists in the Hub. This one fetches the matter from Clio and
 * imports it first, then performs the merge.
 */
const SPECIFIC_MATTER_IMPORT_AND_MERGES: Array<{
  caseName: string;
  keepMatterId: string;
  clientName: string;
  clioDisplayNumber: string;
  sinceISOForLookup: string;
}> = [
  {
    caseName: 'Davvic Limited — re-import VIMBO of Davvic Ltd-00042',
    keepMatterId: 'd45a3464-5406-4146-afb6-00fcbd43e33a',
    clientName: 'Davvic Limited',
    clioDisplayNumber: 'VIMBO of Davvic Ltd-00042',
    // The Clio matter has been around a while — go back far enough to find it
    sinceISOForLookup: '2025-01-01T00:00:00.000Z',
  },
];

export interface SpecificMatterCleanupOutcome {
  caseName: string;
  caseType: 'merge_with_clio_ref' | 'delete_billing_matter' | 'import_and_merge';
  status: 'done' | 'nothing_to_do' | 'skipped' | 'error';
  reason?: string;
  steps?: string[];
}

export interface SpecificMatterCleanupsResult {
  outcomes: SpecificMatterCleanupOutcome[];
}

async function executeMatterMergeWithClioRef(
  supabase: SupabaseInst,
  firmId: string,
  userId: string,
  spec: { caseName: string; keepMatterId: string; sourceClioReference: string }
): Promise<SpecificMatterCleanupOutcome> {
  const steps: string[] = [];
  const caseType: 'merge_with_clio_ref' = 'merge_with_clio_ref';

  // Find the keep matter
  const { data: keepMatter } = await supabase
    .from('matters')
    .select('id, firm_id, client_id, reference, clio_matter_id')
    .eq('id', spec.keepMatterId)
    .maybeSingle();
  if (!keepMatter) {
    return {
      caseName: spec.caseName,
      caseType,
      status: 'nothing_to_do',
      reason: 'Keep matter not found — already merged?',
    };
  }
  const keep = keepMatter as {
    id: string;
    firm_id: string;
    client_id: string;
    reference: string;
    clio_matter_id: string | null;
  };
  if (keep.firm_id !== firmId) {
    return { caseName: spec.caseName, caseType, status: 'error', reason: 'Keep matter not in your firm' };
  }
  if (keep.reference === spec.sourceClioReference && keep.clio_matter_id) {
    return {
      caseName: spec.caseName,
      caseType,
      status: 'nothing_to_do',
      reason: 'Keep matter already has the Clio reference + link',
    };
  }

  // Find the source matter by reference under the same client
  const { data: sourceMatter } = await supabase
    .from('matters')
    .select('id, firm_id, client_id, reference, clio_matter_id')
    .eq('firm_id', firmId)
    .eq('client_id', keep.client_id)
    .eq('reference', spec.sourceClioReference)
    .maybeSingle();
  if (!sourceMatter) {
    return {
      caseName: spec.caseName,
      caseType,
      status: 'nothing_to_do',
      reason: 'Source Clio matter not found under same client — already merged?',
    };
  }
  const source = sourceMatter as {
    id: string;
    firm_id: string;
    client_id: string;
    reference: string;
    clio_matter_id: string | null;
  };
  if (!source.clio_matter_id) {
    return {
      caseName: spec.caseName,
      caseType,
      status: 'skipped',
      reason: 'Source matter has no clio_matter_id — nothing to migrate',
    };
  }
  if (source.id === keep.id) {
    return { caseName: spec.caseName, caseType, status: 'error', reason: 'Source and keep are the same matter' };
  }

  // Safety: no assessments on source
  const { count: sourceAssessmentCount } = await supabase
    .from('assessments')
    .select('id', { count: 'exact', head: true })
    .eq('firm_id', firmId)
    .eq('matter_id', source.id);
  if ((sourceAssessmentCount ?? 0) > 0) {
    return {
      caseName: spec.caseName,
      caseType,
      status: 'skipped',
      reason: `${sourceAssessmentCount} assessment(s) on source matter — manual review needed`,
    };
  }

  const adoptedClioMatterId = source.clio_matter_id;
  const adoptedReference = source.reference;

  // Step 1: NULL clio_matter_id on source (release unique index)
  const { error: e1 } = await supabase
    .from('matters')
    .update({ clio_matter_id: null })
    .eq('id', source.id);
  if (e1) return { caseName: spec.caseName, caseType, status: 'error', reason: `Free source clio_matter_id: ${e1.message}`, steps };
  steps.push('Released clio_matter_id from source matter');

  // Step 2: SET clio_matter_id + reference on keep
  const { error: e2 } = await supabase
    .from('matters')
    .update({ clio_matter_id: adoptedClioMatterId, reference: adoptedReference })
    .eq('id', keep.id);
  if (e2) return { caseName: spec.caseName, caseType, status: 'error', reason: `Update keep matter: ${e2.message}`, steps };
  steps.push(`Set clio_matter_id=${adoptedClioMatterId} and reference="${adoptedReference}" on keep matter`);

  // Step 3: repoint audit events from source to keep
  await supabase
    .from('audit_events')
    .update({ entity_id: keep.id })
    .eq('firm_id', firmId)
    .eq('entity_type', 'matter')
    .eq('entity_id', source.id);

  // Step 4: delete source
  const { error: e4 } = await supabase.from('matters').delete().eq('id', source.id);
  if (e4) return { caseName: spec.caseName, caseType, status: 'error', reason: `Delete source matter: ${e4.message}`, steps };
  steps.push('Deleted source matter');

  await supabase.from('audit_events').insert({
    firm_id: firmId,
    entity_type: 'matter',
    entity_id: keep.id,
    action: 'specific_matter_merge_with_clio_ref',
    metadata: {
      kept_matter_id: keep.id,
      deleted_source_matter_id: source.id,
      adopted_clio_matter_id: adoptedClioMatterId,
      adopted_reference: adoptedReference,
    },
    created_by: userId,
  });

  return { caseName: spec.caseName, caseType, status: 'done', steps };
}

async function executeBillingMatterDelete(
  supabase: SupabaseInst,
  firmId: string,
  userId: string,
  spec: { caseName: string; clientName: string; matterDescription: string }
): Promise<SpecificMatterCleanupOutcome> {
  const steps: string[] = [];
  const caseType: 'delete_billing_matter' = 'delete_billing_matter';

  const { data: clients } = await supabase
    .from('clients')
    .select('id')
    .eq('firm_id', firmId)
    .eq('name', spec.clientName);
  const clientIds = ((clients || []) as { id: string }[]).map((c) => c.id);
  if (clientIds.length === 0) {
    return { caseName: spec.caseName, caseType, status: 'nothing_to_do', reason: 'Client not found' };
  }

  const { data: matters } = await supabase
    .from('matters')
    .select('id, reference')
    .eq('firm_id', firmId)
    .in('client_id', clientIds)
    .eq('description', spec.matterDescription);
  const matterRows = (matters || []) as { id: string; reference: string }[];
  if (matterRows.length === 0) {
    return { caseName: spec.caseName, caseType, status: 'nothing_to_do', reason: 'Matter not found — already deleted?' };
  }
  if (matterRows.length > 1) {
    return {
      caseName: spec.caseName,
      caseType,
      status: 'skipped',
      reason: `Found ${matterRows.length} matters with this description — ambiguous`,
    };
  }
  const target = matterRows[0];

  const { count: assessmentCount } = await supabase
    .from('assessments')
    .select('id', { count: 'exact', head: true })
    .eq('firm_id', firmId)
    .eq('matter_id', target.id);
  if ((assessmentCount ?? 0) > 0) {
    return {
      caseName: spec.caseName,
      caseType,
      status: 'skipped',
      reason: `${assessmentCount} assessment(s) on this matter — manual review needed`,
    };
  }

  const { error: deleteErr } = await supabase.from('matters').delete().eq('id', target.id);
  if (deleteErr) {
    return { caseName: spec.caseName, caseType, status: 'error', reason: `Delete failed: ${deleteErr.message}` };
  }
  steps.push(`Deleted matter "${spec.matterDescription}" (${target.reference})`);

  await supabase.from('audit_events').insert({
    firm_id: firmId,
    entity_type: 'matter',
    entity_id: target.id,
    action: 'specific_billing_matter_deleted',
    metadata: {
      client_name: spec.clientName,
      matter_description: spec.matterDescription,
      matter_reference: target.reference,
    },
    created_by: userId,
  });

  return { caseName: spec.caseName, caseType, status: 'done', steps };
}

async function executeImportAndMerge(
  supabase: SupabaseInst,
  firmId: string,
  userId: string,
  spec: {
    caseName: string;
    keepMatterId: string;
    clientName: string;
    clioDisplayNumber: string;
    sinceISOForLookup: string;
  }
): Promise<SpecificMatterCleanupOutcome> {
  const steps: string[] = [];
  const caseType: 'import_and_merge' = 'import_and_merge';

  // 1. Find the keep matter
  const { data: keepMatter } = await supabase
    .from('matters')
    .select('id, firm_id, client_id, reference, clio_matter_id')
    .eq('id', spec.keepMatterId)
    .maybeSingle();
  if (!keepMatter) {
    return { caseName: spec.caseName, caseType, status: 'nothing_to_do', reason: 'Keep matter not found' };
  }
  const keep = keepMatter as {
    id: string;
    firm_id: string;
    client_id: string;
    reference: string;
    clio_matter_id: string | null;
  };
  if (keep.firm_id !== firmId) {
    return { caseName: spec.caseName, caseType, status: 'error', reason: 'Keep matter not in your firm' };
  }
  if (keep.reference === spec.clioDisplayNumber && keep.clio_matter_id) {
    return {
      caseName: spec.caseName,
      caseType,
      status: 'nothing_to_do',
      reason: 'Keep matter already has the Clio reference + link',
    };
  }

  // 2. Get Clio access token
  const tokenResult = await getClioAccessTokenForFirm(supabase, firmId);
  if (!tokenResult) {
    return { caseName: spec.caseName, caseType, status: 'error', reason: 'Clio is not connected for this firm' };
  }

  // 3. List Clio matters and find the one with the matching display_number
  let clioMatters;
  try {
    clioMatters = await listClioMattersCreatedSince(
      tokenResult.accessToken,
      spec.sinceISOForLookup,
      500
    );
  } catch (err) {
    return {
      caseName: spec.caseName,
      caseType,
      status: 'error',
      reason: `Clio API error: ${err instanceof Error ? err.message : 'Unknown error'}`,
    };
  }
  const clioMatter = clioMatters.find((m) => m.display_number === spec.clioDisplayNumber);
  if (!clioMatter) {
    return {
      caseName: spec.caseName,
      caseType,
      status: 'skipped',
      reason: `Clio matter "${spec.clioDisplayNumber}" not found via API (already imported under a different keep ID?)`,
    };
  }
  if (!clioMatter.client) {
    return { caseName: spec.caseName, caseType, status: 'error', reason: 'Clio matter has no client' };
  }

  // 4. Check if this clio_matter_id is already linked somewhere in Hub
  const clioMatterIdStr = String(clioMatter.id);
  const { data: alreadyLinked } = await supabase
    .from('matters')
    .select('id')
    .eq('firm_id', firmId)
    .eq('clio_matter_id', clioMatterIdStr)
    .maybeSingle();
  const alreadyLinkedRow = alreadyLinked as { id: string } | null;
  if (alreadyLinkedRow && alreadyLinkedRow.id === keep.id) {
    return {
      caseName: spec.caseName,
      caseType,
      status: 'nothing_to_do',
      reason: 'Keep matter is already linked to this Clio matter',
    };
  }
  if (alreadyLinkedRow && alreadyLinkedRow.id !== keep.id) {
    return {
      caseName: spec.caseName,
      caseType,
      status: 'error',
      reason: `Clio matter is already linked to a different Hub matter (${alreadyLinkedRow.id})`,
    };
  }

  // 5. Fetch contact details for the RPC call
  let contact;
  try {
    contact = await fetchClioContact(clioMatter.client.id, tokenResult.accessToken);
  } catch (err) {
    return {
      caseName: spec.caseName,
      caseType,
      status: 'error',
      reason: `Failed to fetch Clio contact: ${err instanceof Error ? err.message : 'Unknown error'}`,
    };
  }

  // 6. Process via RPC — creates a new Hub matter under the existing client
  const { data: rpcData, error: rpcErr } = await supabase.rpc('process_clio_webhook', {
    p_firm_id: firmId,
    p_clio_matter_id: clioMatterIdStr,
    p_matter_display_number: clioMatter.display_number || '',
    p_matter_description: clioMatter.description || '',
    p_clio_contact_id: String(contact.id),
    p_contact_name: contact.name,
    p_contact_type: contact.type || 'Person',
    p_user_id: userId,
  });
  if (rpcErr) {
    return { caseName: spec.caseName, caseType, status: 'error', reason: `RPC failed: ${rpcErr.message}`, steps };
  }
  const rpcResult = rpcData as { client_id?: string; matter_id?: string } | null;
  const newMatterId = rpcResult?.matter_id;
  if (!newMatterId) {
    return { caseName: spec.caseName, caseType, status: 'error', reason: 'RPC returned no matter_id', steps };
  }
  steps.push(`Imported Clio matter (new Hub matter ${newMatterId})`);

  // 7. Verify the new matter is under the same client as the keep matter
  const { data: newMatter } = await supabase
    .from('matters')
    .select('id, client_id, reference, clio_matter_id')
    .eq('id', newMatterId)
    .single();
  if (!newMatter || newMatter.client_id !== keep.client_id) {
    return {
      caseName: spec.caseName,
      caseType,
      status: 'error',
      reason: `New matter's client (${newMatter?.client_id}) doesn't match keep matter's client (${keep.client_id}) — different ${spec.clientName} record?`,
      steps,
    };
  }

  const adoptedClioMatterId = newMatter.clio_matter_id!;
  const adoptedReference = newMatter.reference;

  // 8. NULL clio_matter_id on the new matter (release unique index)
  const { error: e8 } = await supabase
    .from('matters')
    .update({ clio_matter_id: null })
    .eq('id', newMatterId);
  if (e8) return { caseName: spec.caseName, caseType, status: 'error', reason: `Free new clio_matter_id: ${e8.message}`, steps };
  steps.push('Released clio_matter_id from new matter');

  // 9. SET clio_matter_id + reference on the keep matter
  const { error: e9 } = await supabase
    .from('matters')
    .update({ clio_matter_id: adoptedClioMatterId, reference: adoptedReference })
    .eq('id', keep.id);
  if (e9) return { caseName: spec.caseName, caseType, status: 'error', reason: `Update keep matter: ${e9.message}`, steps };
  steps.push(`Set clio_matter_id=${adoptedClioMatterId} and reference="${adoptedReference}" on keep matter`);

  // 10. Repoint audit events
  await supabase
    .from('audit_events')
    .update({ entity_id: keep.id })
    .eq('firm_id', firmId)
    .eq('entity_type', 'matter')
    .eq('entity_id', newMatterId);

  // 11. Delete the new matter
  const { error: e11 } = await supabase.from('matters').delete().eq('id', newMatterId);
  if (e11) return { caseName: spec.caseName, caseType, status: 'error', reason: `Delete new matter: ${e11.message}`, steps };
  steps.push('Deleted intermediate new matter');

  await supabase.from('audit_events').insert({
    firm_id: firmId,
    entity_type: 'matter',
    entity_id: keep.id,
    action: 'specific_matter_import_and_merge',
    metadata: {
      kept_matter_id: keep.id,
      intermediate_matter_id: newMatterId,
      adopted_clio_matter_id: adoptedClioMatterId,
      adopted_reference: adoptedReference,
      clio_display_number: spec.clioDisplayNumber,
    },
    created_by: userId,
  });

  return { caseName: spec.caseName, caseType, status: 'done', steps };
}

export async function runSpecificMatterCleanups(): Promise<
  { success: true; result: SpecificMatterCleanupsResult } | { success: false; error: string }
> {
  try {
    const { supabase, user, profile, error } = await getUserAndProfile();
    if (error || !user || !profile) return { success: false, error: error || 'Not authenticated' };
    if (!canManageIntegrations(profile.role as UserRole)) {
      return { success: false, error: 'Insufficient permissions' };
    }

    const outcomes: SpecificMatterCleanupOutcome[] = [];

    for (const spec of SPECIFIC_MATTER_MERGES) {
      outcomes.push(await executeMatterMergeWithClioRef(supabase, profile.firm_id, user.id, spec));
    }
    for (const spec of SPECIFIC_MATTER_DELETES) {
      outcomes.push(await executeBillingMatterDelete(supabase, profile.firm_id, user.id, spec));
    }
    for (const spec of SPECIFIC_MATTER_IMPORT_AND_MERGES) {
      outcomes.push(await executeImportAndMerge(supabase, profile.firm_id, user.id, spec));
    }

    return { success: true, result: { outcomes } };
  } catch (err) {
    console.error('Error in runSpecificMatterCleanups:', err);
    return { success: false, error: err instanceof Error ? err.message : 'Unknown error' };
  }
}

/**
 * Retroactively enrich every Clio-imported Hub client.
 *
 * Walks every client in the firm with `clio_contact_id IS NOT NULL` and runs
 * the same post-import enrichment that new imports now get automatically:
 *   1. Promote generic entity_type ('individual' / 'corporate') to specific
 *      defaults ('Individual' / 'Private company limited by shares')
 *   2. Companies House search-by-name for corporates with no
 *      registered_number — populates registered_number + registered_address
 *      if exactly one active company matches.
 *
 * Only touches fields the user hasn't already filled in. Safe to re-run.
 *
 * Supports dryRun.
 */
export interface RetroEnrichClientOutcome {
  clientId: string;
  clientName: string;
  clientType: string;
  entityTypeBefore: string;
  entityTypeUpdated: boolean;
  entityTypeAfter?: string;
  chOutcome: 'populated' | 'ambiguous' | 'not_found' | 'skipped' | 'error';
  chError?: string;
  chMatchCount?: number;
  populatedNumber?: string;
}

export interface RetroEnrichClientsResult {
  dryRun: boolean;
  totalClioLinked: number;
  entityTypeUpdated: number;
  chPopulated: number;
  chAmbiguous: number;
  chNotFound: number;
  chSkipped: number;
  errors: number;
  outcomes: RetroEnrichClientOutcome[];
}

export async function retroactivelyEnrichClioImportedClients(
  options: { dryRun?: boolean } = {}
): Promise<
  { success: true; result: RetroEnrichClientsResult } | { success: false; error: string }
> {
  const dryRun = options.dryRun ?? true;
  try {
    const { supabase, user, profile, error } = await getUserAndProfile();
    if (error || !user || !profile) {
      return { success: false, error: error || 'Not authenticated' };
    }
    if (!canManageIntegrations(profile.role as UserRole)) {
      return { success: false, error: 'Insufficient permissions' };
    }

    const { data: clients, error: clientsErr } = await supabase
      .from('clients')
      .select('id, name, client_type, entity_type, clio_contact_id, registered_number')
      .eq('firm_id', profile.firm_id)
      .not('clio_contact_id', 'is', null)
      .order('created_at', { ascending: true });
    if (clientsErr) return { success: false, error: clientsErr.message };

    type ClientRow = {
      id: string;
      name: string;
      client_type: string;
      entity_type: string | null;
      registered_number: string | null;
    };
    const rows = (clients || []) as ClientRow[];

    const outcomes: RetroEnrichClientOutcome[] = [];
    let entityTypeUpdated = 0;
    let chPopulated = 0;
    let chAmbiguous = 0;
    let chNotFound = 0;
    let chSkipped = 0;
    let errors = 0;

    for (const c of rows) {
      const result = await enrichClioImportedClient(supabase, profile.firm_id, c.id, {
        dryRun,
      });
      if (result.entityTypeUpdated) entityTypeUpdated++;
      switch (result.chOutcome) {
        case 'populated':
          chPopulated++;
          break;
        case 'ambiguous':
          chAmbiguous++;
          break;
        case 'not_found':
          chNotFound++;
          break;
        case 'skipped':
          chSkipped++;
          break;
        case 'error':
          errors++;
          break;
      }
      outcomes.push({
        clientId: c.id,
        clientName: c.name,
        clientType: c.client_type,
        entityTypeBefore: c.entity_type ?? '(null)',
        entityTypeUpdated: result.entityTypeUpdated,
        entityTypeAfter: result.entityTypeUpdated
          ? promoteGenericEntityType(c.entity_type) ?? undefined
          : undefined,
        chOutcome: result.chOutcome,
        chError: result.chError,
        chMatchCount: result.chMatchCount,
        populatedNumber: result.populatedNumber,
      });
    }

    if (!dryRun) {
      await supabase.from('audit_events').insert({
        firm_id: profile.firm_id,
        entity_type: 'integration',
        entity_id: 'clio',
        action: 'clio_retro_enrich_clients',
        metadata: {
          total: rows.length,
          entity_type_updated: entityTypeUpdated,
          ch_populated: chPopulated,
          ch_ambiguous: chAmbiguous,
          ch_not_found: chNotFound,
          ch_skipped: chSkipped,
          errors,
        },
        created_by: user.id,
      });
    }

    return {
      success: true,
      result: {
        dryRun,
        totalClioLinked: rows.length,
        entityTypeUpdated,
        chPopulated,
        chAmbiguous,
        chNotFound,
        chSkipped,
        errors,
        outcomes,
      },
    };
  } catch (err) {
    console.error('Error in retroactivelyEnrichClioImportedClients:', err);
    return { success: false, error: err instanceof Error ? err.message : 'Unknown error' };
  }
}
