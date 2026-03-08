/**
 * Debug endpoint to check Clio webhook status.
 * GET /api/integrations/clio/debug-webhook
 *
 * Queries the Clio API to verify the webhook is active and returns its details.
 * Remove this route after debugging is complete.
 */

import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getClioBaseUrl } from '@/lib/clio';

export async function GET() {
  try {
    const supabase = await createClient();

    // Get current user
    const { data: { user }, error: userErr } = await supabase.auth.getUser();
    if (userErr || !user) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }

    // Get user's firm
    const { data: profile } = await supabase
      .from('user_profiles')
      .select('firm_id')
      .eq('user_id', user.id)
      .single();

    if (!profile) {
      return NextResponse.json({ error: 'No profile' }, { status: 401 });
    }

    // Get integration
    const { data: integration } = await supabase
      .from('firm_integrations')
      .select('*')
      .eq('firm_id', profile.firm_id)
      .eq('provider', 'clio')
      .single();

    if (!integration) {
      return NextResponse.json({ error: 'No Clio integration found' }, { status: 404 });
    }

    const result: Record<string, unknown> = {
      db_webhook_id: integration.webhook_id,
      db_webhook_secret_set: !!integration.webhook_secret,
      db_webhook_expires_at: integration.webhook_expires_at,
      db_connected_at: integration.connected_at,
    };

    // Query Clio API for webhook details
    if (integration.webhook_id && integration.access_token) {
      try {
        const baseUrl = getClioBaseUrl();
        const response = await fetch(
          `${baseUrl}/api/v4/webhooks/${integration.webhook_id}.json`,
          {
            headers: {
              Authorization: `Bearer ${integration.access_token}`,
            },
          }
        );

        if (response.ok) {
          const data = await response.json();
          result.clio_webhook = data;
        } else {
          result.clio_webhook_error = `${response.status} ${response.statusText}`;
          const text = await response.text();
          result.clio_webhook_error_body = text;
        }
      } catch (err) {
        result.clio_webhook_error = String(err);
      }

      // Also list ALL webhooks to see what's registered
      try {
        const baseUrl = getClioBaseUrl();
        const response = await fetch(
          `${baseUrl}/api/v4/webhooks.json`,
          {
            headers: {
              Authorization: `Bearer ${integration.access_token}`,
            },
          }
        );

        if (response.ok) {
          const data = await response.json();
          result.clio_all_webhooks = data;
        }
      } catch {
        // ignore
      }
    }

    return NextResponse.json(result, { status: 200 });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
