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

const DIAG_VERSION = '4';

async function clioGet(url: string, accessToken: string): Promise<{ status: number; ok: boolean; body: unknown }> {
  const response = await fetch(url, {
    headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
  });
  let body: unknown;
  try { body = await response.json(); } catch { body = await response.text().catch(() => ''); }
  return { status: response.status, ok: response.ok, body };
}

export async function GET(request: NextRequest) {
  const results: Record<string, unknown> = {};

  try {
    results.diag_version = DIAG_VERSION;
    results.timestamp = new Date().toISOString();

    const supabase = await createClient();
    const { data: { user }, error: userErr } = await supabase.auth.getUser();
    if (userErr || !user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });

    const { data: profile } = await supabase
      .from('user_profiles')
      .select('user_id, firm_id, role')
      .eq('user_id', user.id)
      .single();

    if (!profile || !canManageIntegrations(profile.role as UserRole)) {
      return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 });
    }

    const tokenResult = await getClioAccessTokenForFirm(supabase, profile.firm_id);
    if (!tokenResult) {
      results.token = 'NOT CONNECTED';
      return NextResponse.json(results);
    }

    const { accessToken } = tokenResult;
    const baseUrl = getClioBaseUrl();

    // Get the Clio matter ID
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
      return NextResponse.json({ ...results, error: 'No Clio-linked matter' });
    }

    // 1. List all folders under this matter
    const foldersResult = await clioGet(
      `${baseUrl}/api/v4/folders.json?fields=id,name,parent&matter_id=${clioMatterId}`,
      accessToken
    );
    results.folders = foldersResult;

    // 2. Find the Compliance folder
    const foldersData = foldersResult.ok
      ? ((foldersResult.body as { data?: Array<{ id: number; name: string }> })?.data || [])
      : [];
    const complianceFolder = foldersData.find((f: { name: string }) => f.name === 'Compliance');
    results.compliance_folder = complianceFolder || 'NOT FOUND';

    // 3. If Compliance folder exists, list its documents
    if (complianceFolder) {
      // Try listing docs with folder_id
      const docsInFolder = await clioGet(
        `${baseUrl}/api/v4/documents.json?fields=id,name,created_at,latest_document_version{fully_uploaded,content_type}&parent_id=${complianceFolder.id}&parent_type=Folder`,
        accessToken
      );
      results.docs_in_compliance_v1_parent = docsInFolder;

      // Also try with matter_id filter
      const docsForMatter = await clioGet(
        `${baseUrl}/api/v4/documents.json?fields=id,name,created_at,latest_document_version{fully_uploaded,content_type}&matter_id=${clioMatterId}`,
        accessToken
      );
      results.docs_in_matter = docsForMatter;
    }

    // 4. Get sync records with full details
    const { data: syncRecords } = await supabase
      .from('clio_drive_sync')
      .select('id, status, error_message, sync_type, clio_document_id, clio_document_url, clio_folder_id, created_at, updated_at')
      .eq('clio_matter_id', clioMatterId)
      .order('created_at', { ascending: false })
      .limit(5);

    results.sync_records = syncRecords;

    // 5. If we have a synced document ID, check it exists in Clio
    const syncedRecord = syncRecords?.find((r: { status: string }) => r.status === 'synced');
    if (syncedRecord?.clio_document_id) {
      const docCheck = await clioGet(
        `${baseUrl}/api/v4/documents/${syncedRecord.clio_document_id}.json?fields=id,name,parent{id,name,type},latest_document_version{fully_uploaded,content_type,filename}`,
        accessToken
      );
      results.synced_document_check = docCheck;

      // Suggest URL formats
      results.url_formats = {
        current: syncedRecord.clio_document_url,
        format_nc_hash: `${baseUrl}/nc/#/documents/${syncedRecord.clio_document_id}`,
        format_co_documents: `${baseUrl}/nc/#/co/documents/${syncedRecord.clio_document_id}`,
        format_matters_docs: `${baseUrl}/nc/#/matters/${clioMatterId}/documents/${syncedRecord.clio_document_id}`,
        format_direct: `${baseUrl}/documents/${syncedRecord.clio_document_id}`,
      };
    }

    return NextResponse.json(results, { status: 200 });
  } catch (err) {
    results.fatal_error = String(err);
    return NextResponse.json(results, { status: 500 });
  }
}
