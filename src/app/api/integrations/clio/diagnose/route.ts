/**
 * Clio Integration Diagnostic Route
 *
 * GET /api/integrations/clio/diagnose
 * Tests the Clio API connection step by step to identify permission issues.
 * Only accessible to users who can manage integrations (mlro/admin/platform_admin).
 *
 * TEMPORARY: Remove once Clio Drive sync is confirmed working.
 */

import { NextResponse, type NextRequest } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { canManageIntegrations } from '@/lib/auth/roles';
import { getClioBaseUrl } from '@/lib/clio';
import { getClioAccessTokenForFirm } from '@/lib/clio/token';
import type { UserRole } from '@/lib/auth/roles';

export async function GET(request: NextRequest) {
  const results: Record<string, unknown> = {};

  try {
    // 1. Auth check
    const supabase = await createClient();
    const { data: { user }, error: userErr } = await supabase.auth.getUser();

    if (userErr || !user) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }

    const { data: profile } = await supabase
      .from('user_profiles')
      .select('user_id, firm_id, role')
      .eq('user_id', user.id)
      .single();

    if (!profile || !canManageIntegrations(profile.role as UserRole)) {
      return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 });
    }

    results.firm_id = profile.firm_id;
    results.clio_region = process.env.CLIO_REGION || 'us (default)';
    results.clio_base_url = getClioBaseUrl();

    // 2. Get token
    const tokenResult = await getClioAccessTokenForFirm(supabase, profile.firm_id);
    if (!tokenResult) {
      results.token = 'NOT CONNECTED';
      return NextResponse.json(results);
    }
    results.token = 'OK (have access token)';

    const { accessToken } = tokenResult;
    const baseUrl = getClioBaseUrl();

    // 3. Test: who_am_i (basic auth check)
    try {
      const whoAmI = await fetch(`${baseUrl}/api/v4/users/who_am_i.json`, {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      if (whoAmI.ok) {
        const data = await whoAmI.json();
        results.who_am_i = {
          status: whoAmI.status,
          name: data.data?.name || 'unknown',
          id: data.data?.id,
          enabled: data.data?.enabled,
        };
      } else {
        const body = await whoAmI.text().catch(() => '');
        results.who_am_i = {
          status: whoAmI.status,
          statusText: whoAmI.statusText,
          body: body.substring(0, 300),
        };
      }
    } catch (err) {
      results.who_am_i = { error: String(err) };
    }

    // 4. Test: list matters (basic read permission)
    try {
      const matters = await fetch(`${baseUrl}/api/v4/matters.json?fields=id,display_number&limit=1`, {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      if (matters.ok) {
        const data = await matters.json();
        results.matters_list = {
          status: matters.status,
          count: data.data?.length || 0,
        };
      } else {
        const body = await matters.text().catch(() => '');
        results.matters_list = {
          status: matters.status,
          statusText: matters.statusText,
          body: body.substring(0, 300),
        };
      }
    } catch (err) {
      results.matters_list = { error: String(err) };
    }

    // 5. Get a test matter with clio_matter_id from the URL params or from DB
    const testMatterId = request.nextUrl.searchParams.get('matter_id');
    let clioMatterId: string | null = testMatterId;

    if (!clioMatterId) {
      // Find a clio-linked matter from the DB
      const { data: linkedMatter } = await supabase
        .from('matters')
        .select('clio_matter_id')
        .not('clio_matter_id', 'is', null)
        .limit(1)
        .single();

      clioMatterId = linkedMatter?.clio_matter_id || null;
    }

    if (!clioMatterId) {
      results.folders_test = 'SKIPPED (no Clio-linked matter found)';
      return NextResponse.json(results);
    }

    results.test_clio_matter_id = clioMatterId;

    // 6. Test: list folders for the matter
    try {
      const foldersUrl = `${baseUrl}/api/v4/folders.json?fields=id,name&parent_id=${clioMatterId}&parent_type=Matter`;
      results.folders_request_url = foldersUrl;

      const folders = await fetch(foldersUrl, {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      if (folders.ok) {
        const data = await folders.json();
        results.folders_list = {
          status: folders.status,
          count: data.data?.length || 0,
          folders: data.data?.map((f: { id: number; name: string }) => ({ id: f.id, name: f.name })) || [],
        };
      } else {
        const body = await folders.text().catch(() => '');
        results.folders_list = {
          status: folders.status,
          statusText: folders.statusText,
          body: body.substring(0, 500),
        };
      }
    } catch (err) {
      results.folders_list = { error: String(err) };
    }

    // 7. Test: list documents for the matter
    try {
      const docsUrl = `${baseUrl}/api/v4/documents.json?fields=id,name&matter_id=${clioMatterId}&limit=1`;
      const docs = await fetch(docsUrl, {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      if (docs.ok) {
        const data = await docs.json();
        results.documents_list = {
          status: docs.status,
          count: data.data?.length || 0,
        };
      } else {
        const body = await docs.text().catch(() => '');
        results.documents_list = {
          status: docs.status,
          statusText: docs.statusText,
          body: body.substring(0, 500),
        };
      }
    } catch (err) {
      results.documents_list = { error: String(err) };
    }

    return NextResponse.json(results, { status: 200 });
  } catch (err) {
    results.fatal_error = String(err);
    return NextResponse.json(results, { status: 500 });
  }
}
