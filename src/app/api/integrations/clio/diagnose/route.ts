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

async function testEndpoint(
  url: string,
  accessToken: string
): Promise<{ status: number; statusText: string; ok: boolean; body: unknown }> {
  const response = await fetch(url, {
    headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
  });
  let body: unknown;
  try {
    body = await response.json();
  } catch {
    body = await response.text().catch(() => '');
  }
  return { status: response.status, statusText: response.statusText, ok: response.ok, body };
}

async function testPost(
  url: string,
  accessToken: string,
  data: unknown
): Promise<{ status: number; statusText: string; ok: boolean; body: unknown }> {
  const response = await fetch(url, {
    method: 'POST',
    headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  let body: unknown;
  try {
    body = await response.json();
  } catch {
    body = await response.text().catch(() => '');
  }
  return { status: response.status, statusText: response.statusText, ok: response.ok, body };
}

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

    // 3. Get a test matter with clio_matter_id
    const testMatterId = request.nextUrl.searchParams.get('matter_id');
    let clioMatterId: string | null = testMatterId;

    if (!clioMatterId) {
      const { data: linkedMatter } = await supabase
        .from('matters')
        .select('clio_matter_id')
        .not('clio_matter_id', 'is', null)
        .limit(1)
        .single();
      clioMatterId = linkedMatter?.clio_matter_id || null;
    }

    results.test_clio_matter_id = clioMatterId;

    // 4. Test matters (basic read)
    results.test_matters = await testEndpoint(
      `${baseUrl}/api/v4/matters.json?fields=id,display_number&limit=1`,
      accessToken
    );

    // 5. Test documents list (with matter filter)
    if (clioMatterId) {
      results.test_documents = await testEndpoint(
        `${baseUrl}/api/v4/documents.json?fields=id,name&matter_id=${clioMatterId}&limit=1`,
        accessToken
      );
    }

    // 6. Test folder variations — try different API parameter formats
    if (clioMatterId) {
      // Variation A: parent_id + parent_type (what our code uses)
      results.folders_v1_parent_id_type = await testEndpoint(
        `${baseUrl}/api/v4/folders.json?fields=id,name&parent_id=${clioMatterId}&parent_type=Matter`,
        accessToken
      );

      // Variation B: just parent_id (no type)
      results.folders_v2_parent_id_only = await testEndpoint(
        `${baseUrl}/api/v4/folders.json?fields=id,name&parent_id=${clioMatterId}`,
        accessToken
      );

      // Variation C: matter_id (like documents endpoint uses)
      results.folders_v3_matter_id = await testEndpoint(
        `${baseUrl}/api/v4/folders.json?fields=id,name&matter_id=${clioMatterId}`,
        accessToken
      );

      // Variation D: no filter (list all folders)
      results.folders_v4_all = await testEndpoint(
        `${baseUrl}/api/v4/folders.json?fields=id,name&limit=5`,
        accessToken
      );

      // Variation E: nested under document_categories (Clio uses this for matter folders)
      results.folders_v5_document_categories = await testEndpoint(
        `${baseUrl}/api/v4/document_categories.json?fields=id,name&matter_id=${clioMatterId}`,
        accessToken
      );

      // 7. Try creating a test folder via POST (dry-run info only — won't execute if GET works)
      // Only try this if all GETs failed
      const allFoldersFailed = [
        results.folders_v1_parent_id_type,
        results.folders_v2_parent_id_only,
        results.folders_v3_matter_id,
        results.folders_v4_all,
      ].every((r: unknown) => !(r as { ok: boolean }).ok);

      if (allFoldersFailed) {
        // Test POST to create a folder (this will actually create it if successful)
        results.folders_create_test = await testPost(
          `${baseUrl}/api/v4/folders.json?fields=id,name,parent`,
          accessToken,
          {
            data: {
              name: '_diagnose_test_' + Date.now(),
              parent: { id: Number(clioMatterId), type: 'Matter' },
            },
          }
        );
      }
    }

    return NextResponse.json(results, { status: 200 });
  } catch (err) {
    results.fatal_error = String(err);
    return NextResponse.json(results, { status: 500 });
  }
}
