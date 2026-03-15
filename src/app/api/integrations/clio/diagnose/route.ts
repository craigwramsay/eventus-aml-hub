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

// Bump this to verify which code version is deployed
const DIAG_VERSION = '3';

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
    results.diag_version = DIAG_VERSION;
    results.timestamp = new Date().toISOString();

    // 1. Auth check
    const supabase = await createClient();
    const { data: { user }, error: userErr } = await supabase.auth.getUser();

    if (userErr || !user) {
      return NextResponse.json({ error: 'Not authenticated', diag_version: DIAG_VERSION }, { status: 401 });
    }

    const { data: profile } = await supabase
      .from('user_profiles')
      .select('user_id, firm_id, role')
      .eq('user_id', user.id)
      .single();

    if (!profile || !canManageIntegrations(profile.role as UserRole)) {
      return NextResponse.json({ error: 'Insufficient permissions', diag_version: DIAG_VERSION }, { status: 403 });
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

    if (!clioMatterId) {
      results.error = 'No Clio-linked matter found';
      return NextResponse.json(results);
    }

    // 4. Test: list folders using matter_id (the working approach)
    results.folders_list = await testEndpoint(
      `${baseUrl}/api/v4/folders.json?fields=id,name&matter_id=${clioMatterId}`,
      accessToken
    );

    // 5. Test: CREATE a folder under the matter (this is what the sync does)
    results.folder_create = await testPost(
      `${baseUrl}/api/v4/folders.json?fields=id,name,parent`,
      accessToken,
      {
        data: {
          name: `_diag_test_${Date.now()}`,
          parent: { id: Number(clioMatterId), type: 'Matter' },
        },
      }
    );

    // 6. If folder was created, clean it up (delete it)
    const createBody = results.folder_create as { ok: boolean; body: { data?: { id: number } } };
    if (createBody.ok && createBody.body?.data?.id) {
      const folderId = createBody.body.data.id;
      results.folder_created_id = folderId;
      try {
        const delResponse = await fetch(`${baseUrl}/api/v4/folders/${folderId}.json`, {
          method: 'DELETE',
          headers: { Authorization: `Bearer ${accessToken}` },
        });
        results.folder_cleanup = { status: delResponse.status, ok: delResponse.ok };
      } catch (err) {
        results.folder_cleanup = { error: String(err) };
      }
    }

    // 7. Test: CREATE a document (the upload step)
    // Only test if folder creation worked — use the matter's existing folder
    const foldersList = results.folders_list as { ok: boolean; body: { data?: Array<{ id: number; name: string }> } };
    if (foldersList.ok && foldersList.body?.data && foldersList.body.data.length > 0) {
      const testFolderId = foldersList.body.data[0].id;
      results.document_create_test_folder = testFolderId;
      results.document_create = await testPost(
        `${baseUrl}/api/v4/documents.json?fields=id,name,latest_document_version{uuid,put_url}`,
        accessToken,
        {
          data: {
            name: `_diag_test_${Date.now()}.txt`,
            parent: { id: testFolderId, type: 'Folder' },
          },
        }
      );

      // Clean up test document if created
      const docBody = results.document_create as { ok: boolean; body: { data?: { id: number } } };
      if (docBody.ok && docBody.body?.data?.id) {
        try {
          const delResponse = await fetch(`${baseUrl}/api/v4/documents/${docBody.body.data.id}.json`, {
            method: 'DELETE',
            headers: { Authorization: `Bearer ${accessToken}` },
          });
          results.document_cleanup = { status: delResponse.status, ok: delResponse.ok };
        } catch (err) {
          results.document_cleanup = { error: String(err) };
        }
      }
    }

    // 8. Check existing sync records for this matter's assessments
    const { data: syncRecords } = await supabase
      .from('clio_drive_sync')
      .select('id, status, error_message, sync_type, created_at, updated_at')
      .eq('clio_matter_id', clioMatterId)
      .order('created_at', { ascending: false })
      .limit(5);

    results.recent_sync_records = syncRecords;

    return NextResponse.json(results, { status: 200 });
  } catch (err) {
    results.fatal_error = String(err);
    return NextResponse.json(results, { status: 500 });
  }
}
