/**
 * Clio OAuth Callback Route
 *
 * GET /api/integrations/clio/callback
 * Handles the OAuth callback from Clio. Exchanges code for tokens,
 * stores them in firm_integrations, and registers the webhook.
 */

import { NextResponse, type NextRequest } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { exchangeClioCode, registerClioWebhook } from '@/lib/clio';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const code = searchParams.get('code');
    const state = searchParams.get('state');
    const error = searchParams.get('error');

    // Handle Clio error response
    if (error) {
      console.error('Clio OAuth error:', error);
      return NextResponse.redirect(
        new URL('/settings/integrations?error=clio_denied', request.url)
      );
    }

    if (!code || !state) {
      return NextResponse.redirect(
        new URL('/settings/integrations?error=clio_invalid', request.url)
      );
    }

    // Validate state + nonce
    let statePayload: { firm_id: string; nonce: string };
    try {
      statePayload = JSON.parse(Buffer.from(state, 'base64url').toString());
    } catch {
      return NextResponse.redirect(
        new URL('/settings/integrations?error=clio_invalid_state', request.url)
      );
    }

    const nonceCookie = request.cookies.get('clio_oauth_nonce')?.value;
    if (!nonceCookie || nonceCookie !== statePayload.nonce) {
      return NextResponse.redirect(
        new URL('/settings/integrations?error=clio_nonce_mismatch', request.url)
      );
    }

    // Authenticate user
    const supabase = await createClient();
    const { data: { user }, error: userErr } = await supabase.auth.getUser();

    if (userErr || !user) {
      return NextResponse.redirect(new URL('/login', request.url));
    }

    // Verify the user belongs to the firm in state
    const { data: profile } = await supabase
      .from('user_profiles')
      .select('user_id, firm_id, role')
      .eq('user_id', user.id)
      .single();

    if (!profile || profile.firm_id !== statePayload.firm_id) {
      return NextResponse.redirect(
        new URL('/settings/integrations?error=clio_firm_mismatch', request.url)
      );
    }

    // Exchange code for tokens
    const tokens = await exchangeClioCode(code);
    const tokenExpiresAt = new Date(Date.now() + tokens.expires_in * 1000).toISOString();

    // Register webhook
    const webhookUrl = `${process.env.NEXT_PUBLIC_APP_URL}/api/webhooks/clio`;
    const webhook = await registerClioWebhook(
      tokens.access_token,
      webhookUrl,
      ['created']
    );

    // Log full webhook response for debugging field names
    console.log('Clio webhook registration response:', JSON.stringify(webhook.data, null, 2));

    // Resolve the webhook secret: try API response first, then handshake table.
    // Clio shares the secret via X-Hook-Secret header during handshake, which our
    // webhook handler stores in a temp table. The API response may or may not include it.
    const webhookData = webhook.data as Record<string, unknown>;
    let webhookSecret =
      webhookData.shared_secret ??
      webhookData.secret ??
      null;

    if (!webhookSecret) {
      console.log('Webhook secret not in API response, checking handshake table...');
      const { data: handshakeSecret } = await supabase.rpc(
        'get_clio_webhook_handshake',
        { p_webhook_id: String(webhook.data.id) }
      );
      if (handshakeSecret) {
        webhookSecret = handshakeSecret;
        console.log('Retrieved webhook secret from handshake table');
      } else {
        console.error('No webhook secret found in API response or handshake table!');
      }
    }

    // Resolve expires_at: try both 'expires_at' and 'expired_at' field names
    const webhookExpiresAt =
      webhookData.expires_at ??
      webhookData.expired_at ??
      null;

    // Upsert firm_integrations row
    const { error: upsertErr } = await supabase
      .from('firm_integrations')
      .upsert(
        {
          firm_id: profile.firm_id,
          provider: 'clio',
          access_token: tokens.access_token,
          refresh_token: tokens.refresh_token,
          token_expires_at: tokenExpiresAt,
          webhook_id: String(webhook.data.id),
          webhook_secret: webhookSecret as string | null,
          webhook_expires_at: webhookExpiresAt as string | null,
          config: { region: process.env.CLIO_REGION || 'us' },
          connected_at: new Date().toISOString(),
          connected_by: user.id,
        },
        { onConflict: 'firm_id,provider' }
      );

    if (upsertErr) {
      console.error('Failed to store Clio integration:', upsertErr);
      return NextResponse.redirect(
        new URL('/settings/integrations?error=clio_store_failed', request.url)
      );
    }

    // Audit log
    await supabase.from('audit_events').insert({
      firm_id: profile.firm_id,
      entity_type: 'integration',
      entity_id: 'clio',
      action: 'clio_connected',
      metadata: {
        webhook_id: String(webhook.data.id),
        webhook_expires_at: webhookExpiresAt,
        secret_source: webhookData.shared_secret ? 'api_response' : 'handshake',
      },
      created_by: user.id,
    });

    // Clear nonce cookie and redirect to settings
    const response = NextResponse.redirect(
      new URL('/settings/integrations?connected=clio', request.url)
    );
    response.cookies.delete('clio_oauth_nonce');

    return response;
  } catch (err) {
    console.error('Error in Clio OAuth callback:', err);
    return NextResponse.redirect(
      new URL('/settings/integrations?error=clio_failed', request.url)
    );
  }
}
