/**
 * Amiqus Webhook Handler
 *
 * POST /api/webhooks/amiqus
 * Receives webhook events from Amiqus (record.finished, record.updated, etc.).
 * Verifies X-AQID-Signature via SECURITY DEFINER RPC, then processes the event.
 *
 * No user session required — webhook endpoints are in PUBLIC_ROUTES.
 * All DB writes happen through SECURITY DEFINER functions.
 */

import { NextResponse, type NextRequest } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getAmiqusApiKey, getAmiqusRecord } from '@/lib/amiqus';
import type { AmiqusWebhookPayload } from '@/lib/amiqus';

export async function POST(request: NextRequest) {
  try {
    const body = await request.text();

    // Verify HMAC signature
    const signature = request.headers.get('X-AQID-Signature');
    if (!signature) {
      return NextResponse.json({ error: 'Missing signature' }, { status: 401 });
    }

    const supabase = await createClient();

    // Call RPC to verify signature against stored webhook secrets
    const { data: verifyResult, error: verifyErr } = await supabase
      .rpc('verify_amiqus_webhook', {
        p_signature: signature,
        p_body: body,
      });

    if (verifyErr || !verifyResult || verifyResult.length === 0) {
      console.error('Amiqus webhook signature verification failed:', verifyErr);
      return NextResponse.json({ error: 'Invalid signature' }, { status: 401 });
    }

    const { firm_id } = verifyResult[0];

    // Parse the webhook payload
    let payload: AmiqusWebhookPayload;
    try {
      payload = JSON.parse(body) as AmiqusWebhookPayload;
    } catch {
      return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
    }

    const recordId = payload.data?.id;
    if (!recordId) {
      return NextResponse.json({ status: 'ignored', reason: 'no_record_id' });
    }

    // Handle record.finished — verification complete
    if (payload.event === 'record.finished') {
      // Fetch the record from Amiqus to get the verified date
      let verifiedAt: string | undefined;
      const apiKey = getAmiqusApiKey();
      if (apiKey) {
        try {
          const record = await getAmiqusRecord(recordId, apiKey);
          if (record.completed_at) {
            verifiedAt = record.completed_at.split('T')[0]; // date only
          }
        } catch (err) {
          console.warn('Failed to fetch Amiqus record details:', err);
        }
      }

      const { data: processResult, error: processErr } = await supabase
        .rpc('process_amiqus_webhook', {
          p_firm_id: firm_id,
          p_amiqus_record_id: recordId,
          p_status: 'complete',
          p_verified_at: verifiedAt,
        });

      if (processErr) {
        console.error('Failed to process Amiqus webhook:', processErr);
        return NextResponse.json({ error: 'Processing failed' }, { status: 500 });
      }

      return NextResponse.json({ status: 'processed', result: processResult });
    }

    // Handle record.updated — status change
    if (payload.event === 'record.updated') {
      // Map Amiqus status to our status
      let status = 'in_progress';
      if (payload.data.status === 'failed' || payload.data.status === 'rejected') {
        status = 'failed';
      } else if (payload.data.status === 'expired') {
        status = 'expired';
      }

      const { data: processResult, error: processErr } = await supabase
        .rpc('process_amiqus_webhook', {
          p_firm_id: firm_id,
          p_amiqus_record_id: recordId,
          p_status: status,
        });

      if (processErr) {
        console.error('Failed to process Amiqus status update:', processErr);
        return NextResponse.json({ error: 'Processing failed' }, { status: 500 });
      }

      return NextResponse.json({ status: 'processed', result: processResult });
    }

    // Unhandled event type — acknowledge
    return NextResponse.json({ status: 'ignored', event: payload.event });
  } catch (err) {
    console.error('Amiqus webhook error:', err);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}
