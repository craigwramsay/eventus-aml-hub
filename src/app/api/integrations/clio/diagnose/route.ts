/**
 * Clio Integration Diagnostic Route — v5
 *
 * GET /api/integrations/clio/diagnose
 * Full end-to-end upload test: create doc, S3 upload, mark fully_uploaded.
 *
 * TEMPORARY: Remove once Clio Drive sync is confirmed working.
 */

import { NextResponse, type NextRequest } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { canManageIntegrations } from '@/lib/auth/roles';
import { getClioBaseUrl } from '@/lib/clio';
import { getClioAccessTokenForFirm } from '@/lib/clio/token';
import type { UserRole } from '@/lib/auth/roles';

const DIAG_VERSION = '5';

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
    if (!tokenResult) return NextResponse.json({ ...results, error: 'Clio not connected' });

    const { accessToken } = tokenResult;
    const baseUrl = getClioBaseUrl();

    // Get matter
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
    if (!clioMatterId) return NextResponse.json({ ...results, error: 'No Clio-linked matter' });

    results.test_clio_matter_id = clioMatterId;

    // Find Compliance folder
    const foldersResp = await fetch(
      `${baseUrl}/api/v4/folders.json?fields=id,name&matter_id=${clioMatterId}`,
      { headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' } }
    );
    const foldersData = await foldersResp.json();
    const complianceFolder = foldersData.data?.find((f: { name: string }) => f.name === 'Compliance');

    if (!complianceFolder) {
      return NextResponse.json({ ...results, error: 'No Compliance folder found' });
    }
    results.compliance_folder_id = complianceFolder.id;

    // ── Full Upload Test ──────────────────────────────────────────

    const testContent = '<html><body><h1>Upload Test</h1><p>This is a diagnostic test file.</p></body></html>';
    const testFileName = `_upload_test_${Date.now()}.html`;

    // Step 1: Create document record (with put_headers)
    const createFields = 'id,name,latest_document_version{uuid,put_url,put_headers}';
    const createResp = await fetch(
      `${baseUrl}/api/v4/documents.json?fields=${encodeURIComponent(createFields)}`,
      {
        method: 'POST',
        headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          data: {
            name: testFileName,
            parent: { id: complianceFolder.id, type: 'Folder' },
          },
        }),
      }
    );
    const createBody = await createResp.json();
    results.step1_create = {
      status: createResp.status,
      ok: createResp.ok,
      body: createBody,
    };

    if (!createResp.ok) {
      return NextResponse.json({ ...results, error: 'Step 1 (create) failed' });
    }

    const doc = createBody.data;
    const version = doc?.latest_document_version;
    results.step1_put_url = version?.put_url ? 'present' : 'MISSING';
    results.step1_put_headers = version?.put_headers || 'NONE RETURNED';

    if (!version?.put_url) {
      return NextResponse.json({ ...results, error: 'No put_url returned' });
    }

    // Step 2: PUT file bytes to S3
    const putHeaders: Record<string, string> = {};
    if (Array.isArray(version.put_headers)) {
      for (const h of version.put_headers) {
        putHeaders[h.name] = h.value;
      }
    }
    putHeaders['Content-Type'] = 'text/html';
    const fileBuffer = new TextEncoder().encode(testContent);
    putHeaders['Content-Length'] = String(fileBuffer.byteLength);

    results.step2_headers_sent = putHeaders;

    const putResp = await fetch(version.put_url, {
      method: 'PUT',
      headers: putHeaders,
      body: fileBuffer,
    });

    let putRespBody = '';
    try { putRespBody = await putResp.text(); } catch { /* ignore */ }

    results.step2_s3_upload = {
      status: putResp.status,
      ok: putResp.ok,
      statusText: putResp.statusText,
      body: putRespBody.substring(0, 500),
    };

    if (!putResp.ok) {
      // Clean up the doc record
      await fetch(`${baseUrl}/api/v4/documents/${doc.id}.json`, {
        method: 'DELETE', headers: { Authorization: `Bearer ${accessToken}` },
      });
      return NextResponse.json({ ...results, error: 'Step 2 (S3 upload) failed' });
    }

    // Step 3: PATCH to mark fully_uploaded
    const patchResp = await fetch(
      `${baseUrl}/api/v4/documents/${doc.id}.json`,
      {
        method: 'PATCH',
        headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          data: {
            latest_document_version: {
              uuid: version.uuid,
              fully_uploaded: true,
            },
          },
        }),
      }
    );
    let patchBody: unknown;
    try { patchBody = await patchResp.json(); } catch { patchBody = await patchResp.text().catch(() => ''); }

    results.step3_patch = {
      status: patchResp.status,
      ok: patchResp.ok,
      body: patchBody,
    };

    // Step 4: Verify — re-fetch the document to check it's complete
    const verifyResp = await fetch(
      `${baseUrl}/api/v4/documents/${doc.id}.json?fields=id,name,latest_document_version{uuid,fully_uploaded}`,
      { headers: { Authorization: `Bearer ${accessToken}` } }
    );
    const verifyBody = await verifyResp.json();
    results.step4_verify = {
      status: verifyResp.status,
      ok: verifyResp.ok,
      body: verifyBody,
    };

    // Step 5: Check if it appears in document listings now
    const listResp = await fetch(
      `${baseUrl}/api/v4/documents.json?fields=id,name&matter_id=${clioMatterId}`,
      { headers: { Authorization: `Bearer ${accessToken}` } }
    );
    const listBody = await listResp.json();
    results.step5_listing = {
      status: listResp.status,
      ok: listResp.ok,
      total_docs: listBody.meta?.records || 0,
      docs: listBody.data,
    };

    // Clean up test document
    const delResp = await fetch(`${baseUrl}/api/v4/documents/${doc.id}.json`, {
      method: 'DELETE', headers: { Authorization: `Bearer ${accessToken}` },
    });
    results.cleanup = { status: delResp.status, ok: delResp.ok };

    // Also check the existing synced document
    const { data: syncedRecord } = await supabase
      .from('clio_drive_sync')
      .select('clio_document_id, clio_document_url, clio_folder_id')
      .eq('clio_matter_id', clioMatterId)
      .eq('status', 'synced')
      .eq('sync_type', 'finalisation_html')
      .order('created_at', { ascending: false })
      .limit(1)
      .single();

    if (syncedRecord?.clio_document_id) {
      const existingDocResp = await fetch(
        `${baseUrl}/api/v4/documents/${syncedRecord.clio_document_id}.json?fields=id,name,latest_document_version{uuid,fully_uploaded}`,
        { headers: { Authorization: `Bearer ${accessToken}` } }
      );
      const existingDocBody = await existingDocResp.json();
      results.existing_synced_doc = {
        sync_record: syncedRecord,
        clio_check: existingDocBody,
      };
    }

    return NextResponse.json(results, { status: 200 });
  } catch (err) {
    results.fatal_error = String(err);
    return NextResponse.json(results, { status: 500 });
  }
}
