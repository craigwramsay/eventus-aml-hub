/**
 * Clio Webhook Handler
 *
 * POST /api/webhooks/clio
 * Receives webhook events from Clio (matter.create, etc.).
 * Verifies HMAC signature using Node.js crypto, then processes the event.
 *
 * No user session required — webhook endpoints are in PUBLIC_ROUTES.
 * All DB writes happen through SECURITY DEFINER functions.
 */

import { NextResponse, type NextRequest } from 'next/server';
import { createHmac, timingSafeEqual } from 'crypto';
import { createClient } from '@/lib/supabase/server';
import { fetchClioMatter, fetchClioContact, registerClioWebhook, deleteClioWebhook } from '@/lib/clio';
import type { ClioWebhookPayload } from '@/lib/clio';

export async function POST(request: NextRequest) {
  try {
    const body = await request.text();

    // Handle Clio webhook handshake: if X-Hook-Secret is present, echo it back
    // AND store the secret in the database for the callback route to retrieve.
    // Clio shares the HMAC secret via this handshake header, not in the API response.
    const hookSecret = request.headers.get('X-Hook-Secret');
    if (hookSecret) {
      console.log('Clio webhook handshake received, body:', body || '(empty)');

      // Store the secret keyed by webhook ID (parsed from body) or 'pending' as fallback.
      // The callback route will retrieve it after registerClioWebhook returns.
      try {
        let webhookId = 'pending';
        if (body) {
          try {
            const handshakePayload = JSON.parse(body);
            const parsedId = handshakePayload?.data?.id ?? handshakePayload?.id;
            if (parsedId) webhookId = String(parsedId);
          } catch {
            // Body isn't JSON — use 'pending' key
          }
        }

        console.log('Storing handshake secret with key:', webhookId);
        const supabase = await createClient();
        await supabase.rpc('store_clio_webhook_handshake', {
          p_webhook_id: webhookId,
          p_secret: hookSecret,
        });
        console.log('Handshake secret stored successfully');
      } catch (err) {
        console.error('Failed to store webhook handshake secret:', err);
      }

      return new NextResponse(null, {
        status: 200,
        headers: { 'X-Hook-Secret': hookSecret },
      });
    }

    // Verify HMAC signature
    const signature = request.headers.get('X-Hook-Signature');
    if (!signature) {
      return NextResponse.json({ error: 'Missing signature' }, { status: 401 });
    }

    const supabase = await createClient();

    // Verify HMAC signature in Node.js (avoids pgcrypto dependency issues)
    // Fetch all Clio integrations with webhook secrets via SECURITY DEFINER RPC
    const { data: integrations, error: fetchErr } = await supabase
      .rpc('get_clio_integrations_for_verification');

    if (fetchErr || !integrations || integrations.length === 0) {
      console.error('Failed to fetch Clio integrations for verification:', fetchErr);
      return NextResponse.json({ error: 'No integrations configured' }, { status: 401 });
    }

    // Try each integration's secret to find a match
    let firm_id: string | null = null;
    let access_token: string | null = null;

    for (const integration of integrations) {
      const computed = createHmac('sha256', integration.webhook_secret)
        .update(body)
        .digest('hex');

      // Use timing-safe comparison to prevent timing attacks
      try {
        const sigBuf = Buffer.from(signature, 'utf8');
        const computedBuf = Buffer.from(computed, 'utf8');
        if (sigBuf.length === computedBuf.length && timingSafeEqual(sigBuf, computedBuf)) {
          firm_id = integration.firm_id;
          access_token = integration.access_token;
          break;
        }
      } catch {
        // Length mismatch — not a match, try next
      }
    }

    if (!firm_id || !access_token) {
      console.error('Clio webhook signature verification failed: no matching secret');
      console.error('Signature (first 16 chars):', signature?.substring(0, 16) + '...');
      console.error('Signature length:', signature?.length, 'Body length:', body.length);
      // Log computed HMAC for first integration (for debugging)
      if (integrations.length > 0) {
        const debugHmac = createHmac('sha256', integrations[0].webhook_secret)
          .update(body)
          .digest('hex');
        console.error('Computed HMAC (first 16 chars):', debugHmac.substring(0, 16) + '...');
        console.error('Secret (first 8 chars):', integrations[0].webhook_secret.substring(0, 8) + '...');
      }
      return NextResponse.json({ error: 'Invalid signature' }, { status: 401 });
    }

    if (!access_token) {
      console.error('No access token available for firm:', firm_id);
      return NextResponse.json({ error: 'No access token' }, { status: 500 });
    }

    // Parse the webhook payload
    let payload: ClioWebhookPayload;
    try {
      payload = JSON.parse(body) as ClioWebhookPayload;
    } catch {
      return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
    }

    console.log('Clio webhook received, type:', payload.type, 'data.id:', payload.data?.id);

    // Handle matter creation event (Clio may send 'created' or 'create')
    const isMatterCreate = payload.type === 'matter.created' || payload.type === 'matter.create';
    if (isMatterCreate && payload.data?.id) {
      const matterId = payload.data.id;

      // Fetch full matter details from Clio API (webhook payloads are minimal)
      const matter = await fetchClioMatter(matterId, access_token);

      if (!matter.client) {
        console.warn('Clio matter has no client, skipping:', matterId);
        return NextResponse.json({ status: 'skipped', reason: 'no_client' });
      }

      // Fetch contact details for email etc.
      const contact = await fetchClioContact(matter.client.id, access_token);

      // Process via SECURITY DEFINER RPC
      const { data: processResult, error: processErr } = await supabase
        .rpc('process_clio_webhook', {
          p_firm_id: firm_id,
          p_clio_matter_id: String(matter.id),
          p_matter_display_number: matter.display_number || '',
          p_matter_description: matter.description || '',
          p_clio_contact_id: String(contact.id),
          p_contact_name: contact.name,
          p_contact_type: contact.type,
          p_user_id: '00000000-0000-0000-0000-000000000000',
        });

      if (processErr) {
        console.error('Failed to process Clio webhook:', processErr);
        return NextResponse.json({ error: 'Processing failed' }, { status: 500 });
      }

      // Auto-renew webhook if expiring within 2 days
      renewWebhookIfNeeded(supabase, firm_id, access_token).catch(() => {});

      return NextResponse.json({
        status: 'processed',
        result: processResult,
      });
    }

    // Auto-renew webhook if expiring within 2 days
    // (runs in background after processing, non-blocking)
    renewWebhookIfNeeded(supabase, firm_id, access_token).catch(() => {});

    // Unhandled event type — acknowledge but don't process
    return NextResponse.json({ status: 'ignored', type: payload.type });
  } catch (err) {
    console.error('Clio webhook error:', err);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}

/**
 * Auto-renew the Clio webhook if it expires within 2 days.
 * Non-blocking — errors are swallowed by the caller.
 */
async function renewWebhookIfNeeded(
  supabase: Awaited<ReturnType<typeof createClient>>,
  firmId: string,
  accessToken: string
) {
  const { data: integration } = await supabase
    .from('firm_integrations')
    .select('id, webhook_id, webhook_expires_at')
    .eq('firm_id', firmId)
    .eq('provider', 'clio')
    .single();

  if (!integration?.webhook_expires_at) return;

  const expiresAt = new Date(integration.webhook_expires_at).getTime();
  const twoDaysMs = 2 * 24 * 60 * 60 * 1000;
  if (expiresAt - Date.now() > twoDaysMs) return; // Not expiring soon

  // Delete old webhook
  if (integration.webhook_id) {
    try { await deleteClioWebhook(accessToken, integration.webhook_id); } catch { /* */ }
  }

  // Register new
  const webhookUrl = `${process.env.NEXT_PUBLIC_APP_URL}/api/webhooks/clio`;
  const webhook = await registerClioWebhook(accessToken, webhookUrl, ['created']);

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

  await supabase
    .from('firm_integrations')
    .update({
      webhook_id: String(webhook.data.id),
      webhook_secret: webhookSecret as string | null,
      webhook_expires_at: webhookExpiresAt as string | null,
      updated_at: new Date().toISOString(),
    })
    .eq('id', integration.id);
}
