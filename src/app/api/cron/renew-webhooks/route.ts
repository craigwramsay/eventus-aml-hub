/**
 * Cron: Renew Clio Webhooks
 *
 * GET /api/cron/renew-webhooks
 *
 * Runs daily via Vercel Cron. Checks all Clio integrations for webhooks
 * expiring within 48 hours and renews them automatically.
 *
 * Secured by CRON_SECRET — Vercel sends this in the Authorization header.
 */

import { NextResponse, type NextRequest } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import {
  registerClioWebhook,
  deleteClioWebhook,
  refreshClioToken,
} from '@/lib/clio';

export async function GET(request: NextRequest) {
  // Verify cron secret (Vercel sends as Bearer token)
  const authHeader = request.headers.get('authorization');
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const supabase = await createClient();
  const results: Array<{ firmId: string; status: string; error?: string }> = [];

  try {
    // Get all integrations with webhooks expiring within 48 hours
    const { data: expiring, error: rpcErr } = await supabase
      .rpc('get_expiring_clio_webhooks', { p_hours_threshold: 48 });

    if (rpcErr) {
      console.error('Failed to fetch expiring webhooks:', rpcErr);
      return NextResponse.json(
        { error: 'Failed to fetch expiring webhooks', details: rpcErr.message },
        { status: 500 }
      );
    }

    if (!expiring || expiring.length === 0) {
      return NextResponse.json({ message: 'No webhooks need renewal', renewed: 0 });
    }

    for (const integration of expiring) {
      try {
        let accessToken = integration.access_token;
        let newAccessToken: string | null = null;
        let newRefreshToken: string | null = null;
        let newTokenExpiresAt: string | null = null;

        // Refresh access token if expired or expiring within 5 minutes
        const tokenExpiresAt = integration.token_expires_at
          ? new Date(integration.token_expires_at)
          : null;
        const tokenBufferMs = 5 * 60 * 1000;

        if (tokenExpiresAt && Date.now() >= tokenExpiresAt.getTime() - tokenBufferMs) {
          if (!integration.refresh_token) {
            results.push({
              firmId: integration.firm_id,
              status: 'skipped',
              error: 'No refresh token',
            });
            continue;
          }

          const tokens = await refreshClioToken(integration.refresh_token);
          accessToken = tokens.access_token;
          newAccessToken = tokens.access_token;
          newRefreshToken = tokens.refresh_token;
          newTokenExpiresAt = new Date(Date.now() + tokens.expires_in * 1000).toISOString();
        }

        // Delete old webhook (non-fatal if it fails — may have already expired)
        if (integration.webhook_id) {
          try {
            await deleteClioWebhook(accessToken, integration.webhook_id);
          } catch {
            // Non-fatal
          }
        }

        // Register new webhook
        const webhookUrl = `${process.env.NEXT_PUBLIC_APP_URL}/api/webhooks/clio`;
        const webhook = await registerClioWebhook(accessToken, webhookUrl, ['created']);

        // Resolve secret: try API response first, then handshake table
        const webhookData = webhook.data as Record<string, unknown>;
        let webhookSecret = (webhookData.shared_secret ?? webhookData.secret ?? null) as string | null;

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
            if (pendingSecret) webhookSecret = pendingSecret as string;
          }
        }

        const webhookExpiresAt = (webhookData.expires_at ?? webhookData.expired_at ?? null) as string | null;

        // Update DB via RPC
        const { error: updateErr } = await supabase.rpc('update_clio_webhook', {
          p_integration_id: integration.integration_id,
          p_webhook_id: String(webhook.data.id),
          p_webhook_secret: webhookSecret,
          p_webhook_expires_at: webhookExpiresAt,
          p_access_token: newAccessToken,
          p_refresh_token: newRefreshToken,
          p_token_expires_at: newTokenExpiresAt,
        });

        if (updateErr) {
          console.error(`Failed to update webhook for firm ${integration.firm_id}:`, updateErr);
          results.push({
            firmId: integration.firm_id,
            status: 'error',
            error: `DB update failed: ${updateErr.message}`,
          });
          continue;
        }

        results.push({ firmId: integration.firm_id, status: 'renewed' });
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Unknown error';
        console.error(`Failed to renew webhook for firm ${integration.firm_id}:`, message);
        results.push({
          firmId: integration.firm_id,
          status: 'error',
          error: message,
        });
      }
    }

    const renewed = results.filter((r) => r.status === 'renewed').length;
    const failed = results.filter((r) => r.status === 'error').length;

    return NextResponse.json({
      message: `Processed ${expiring.length} webhook(s): ${renewed} renewed, ${failed} failed`,
      renewed,
      failed,
      results,
    });
  } catch (err) {
    console.error('Cron renew-webhooks error:', err);
    return NextResponse.json(
      { error: 'Internal error', details: err instanceof Error ? err.message : 'Unknown' },
      { status: 500 }
    );
  }
}
