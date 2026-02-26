/**
 * Clio OAuth Connect Route
 *
 * GET /api/integrations/clio/connect
 * Initiates the Clio OAuth flow. Redirects to Clio's authorization page.
 * Requires authenticated user with mlro/admin/platform_admin role.
 */

import { NextResponse, type NextRequest } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { canManageIntegrations } from '@/lib/auth/roles';
import { getClioBaseUrl } from '@/lib/clio';
import type { UserRole } from '@/lib/auth/roles';

export async function GET(request: NextRequest) {
  try {
    const clientId = process.env.CLIO_CLIENT_ID;
    if (!clientId) {
      return NextResponse.json(
        { error: 'Clio integration is not configured' },
        { status: 503 }
      );
    }

    // Authenticate user
    const supabase = await createClient();
    const { data: { user }, error: userErr } = await supabase.auth.getUser();

    if (userErr || !user) {
      return NextResponse.redirect(new URL('/login', request.url));
    }

    // Get profile and check role
    const { data: profile } = await supabase
      .from('user_profiles')
      .select('user_id, firm_id, role')
      .eq('user_id', user.id)
      .single();

    if (!profile || !canManageIntegrations(profile.role as UserRole)) {
      return NextResponse.json(
        { error: 'Insufficient permissions to manage integrations' },
        { status: 403 }
      );
    }

    // Generate state param: base64 of firm_id + nonce
    const nonce = crypto.randomUUID();
    const state = Buffer.from(JSON.stringify({
      firm_id: profile.firm_id,
      nonce,
    })).toString('base64url');

    // Store nonce in httpOnly cookie for CSRF protection
    const redirectUrl = new URL(`${getClioBaseUrl()}/oauth/authorize`);
    redirectUrl.searchParams.set('response_type', 'code');
    redirectUrl.searchParams.set('client_id', clientId);
    redirectUrl.searchParams.set('redirect_uri', `${process.env.NEXT_PUBLIC_APP_URL}/api/integrations/clio/callback`);
    redirectUrl.searchParams.set('state', state);

    const response = NextResponse.redirect(redirectUrl.toString());
    response.cookies.set('clio_oauth_nonce', nonce, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 600, // 10 minutes
      path: '/',
    });

    return response;
  } catch (err) {
    console.error('Error initiating Clio OAuth:', err);
    return NextResponse.json(
      { error: 'Failed to initiate Clio connection' },
      { status: 500 }
    );
  }
}
