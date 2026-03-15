/**
 * Clio Integration Diagnostic Route — v6
 *
 * Tests alternative PATCH formats for marking a document as fully_uploaded.
 * The current format is silently ignored by Clio EU.
 *
 * TEMPORARY: Remove once Clio Drive sync is confirmed working.
 */

import { NextResponse, type NextRequest } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { canManageIntegrations } from '@/lib/auth/roles';
import { getClioBaseUrl } from '@/lib/clio';
import { getClioAccessTokenForFirm } from '@/lib/clio/token';
import type { UserRole } from '@/lib/auth/roles';

const DIAG_VERSION = '6';

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

    // Find Compliance folder
    const foldersResp = await fetch(
      `${baseUrl}/api/v4/folders.json?fields=id,name&matter_id=${clioMatterId}`,
      { headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' } }
    );
    const foldersBody = await foldersResp.json();
    const complianceFolder = foldersBody.data?.find((f: { name: string }) => f.name === 'Compliance');
    if (!complianceFolder) return NextResponse.json({ ...results, error: 'No Compliance folder' });

    // Step 1: Create document — request ALL version fields
    const createFields = 'id,name,latest_document_version{id,uuid,put_url,put_headers,fully_uploaded,filename,content_type}';
    const createResp = await fetch(
      `${baseUrl}/api/v4/documents.json?fields=${encodeURIComponent(createFields)}`,
      {
        method: 'POST',
        headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          data: { name: `_patch_test_${Date.now()}.html`, parent: { id: complianceFolder.id, type: 'Folder' } },
        }),
      }
    );
    const createBody = await createResp.json();
    results.step1_create = createBody;

    if (!createResp.ok) return NextResponse.json({ ...results, error: 'Create failed' });

    const doc = createBody.data;
    const version = doc?.latest_document_version;
    if (!version?.put_url) return NextResponse.json({ ...results, error: 'No put_url' });

    // Step 2: Upload to S3
    const putHeaders: Record<string, string> = {};
    if (Array.isArray(version.put_headers)) {
      for (const h of version.put_headers) putHeaders[h.name] = h.value;
    }
    putHeaders['Content-Type'] = 'text/html';
    const content = new TextEncoder().encode('<html><body><h1>Test</h1></body></html>');
    putHeaders['Content-Length'] = String(content.byteLength);

    const putResp = await fetch(version.put_url, { method: 'PUT', headers: putHeaders, body: content });
    results.step2_s3 = { status: putResp.status, ok: putResp.ok };

    if (!putResp.ok) {
      await fetch(`${baseUrl}/api/v4/documents/${doc.id}.json`, { method: 'DELETE', headers: { Authorization: `Bearer ${accessToken}` } });
      return NextResponse.json({ ...results, error: 'S3 upload failed' });
    }

    // Step 3: Try MULTIPLE PATCH formats to find the one that works

    // Format A (current code): nested under latest_document_version
    const patchA = await fetch(`${baseUrl}/api/v4/documents/${doc.id}.json?fields=id,latest_document_version{uuid,fully_uploaded}`, {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        data: { latest_document_version: { uuid: version.uuid, fully_uploaded: true } },
      }),
    });
    const patchABody = await patchA.json();
    results.patch_format_A = { label: 'nested latest_document_version', status: patchA.status, body: patchABody };

    // Check if A worked
    const verifyA = await fetch(
      `${baseUrl}/api/v4/documents/${doc.id}.json?fields=id,latest_document_version{uuid,fully_uploaded}`,
      { headers: { Authorization: `Bearer ${accessToken}` } }
    );
    const verifyABody = await verifyA.json();
    results.verify_after_A = verifyABody;

    const aWorked = verifyABody.data?.latest_document_version?.fully_uploaded === true;
    results.patch_A_worked = aWorked;

    if (!aWorked) {
      // Format B: flat data with uuid and fully_uploaded
      const patchB = await fetch(`${baseUrl}/api/v4/documents/${doc.id}.json?fields=id,latest_document_version{uuid,fully_uploaded}`, {
        method: 'PATCH',
        headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          data: { uuid: version.uuid, fully_uploaded: true },
        }),
      });
      const patchBBody = await patchB.json();
      results.patch_format_B = { label: 'flat uuid + fully_uploaded', status: patchB.status, body: patchBBody };

      const verifyB = await fetch(
        `${baseUrl}/api/v4/documents/${doc.id}.json?fields=id,latest_document_version{uuid,fully_uploaded}`,
        { headers: { Authorization: `Bearer ${accessToken}` } }
      );
      results.verify_after_B = await verifyB.json();
      const bWorked = (results.verify_after_B as { data?: { latest_document_version?: { fully_uploaded?: boolean } } })?.data?.latest_document_version?.fully_uploaded === true;
      results.patch_B_worked = bWorked;

      if (!bWorked && version.id) {
        // Format C: PATCH the version endpoint directly using version ID
        const patchC = await fetch(`${baseUrl}/api/v4/document_versions/${version.id}.json?fields=id,uuid,fully_uploaded`, {
          method: 'PATCH',
          headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({
            data: { fully_uploaded: true },
          }),
        });
        let patchCBody: unknown;
        try { patchCBody = await patchC.json(); } catch { patchCBody = await patchC.text(); }
        results.patch_format_C = { label: 'PATCH version endpoint by id', status: patchC.status, body: patchCBody };
      }

      // Format D: PATCH the version endpoint using UUID
      const patchD = await fetch(`${baseUrl}/api/v4/document_versions/${version.uuid}.json?fields=id,uuid,fully_uploaded`, {
        method: 'PATCH',
        headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          data: { fully_uploaded: true },
        }),
      });
      let patchDBody: unknown;
      try { patchDBody = await patchD.json(); } catch { patchDBody = await patchD.text(); }
      results.patch_format_D = { label: 'PATCH version endpoint by uuid', status: patchD.status, body: patchDBody };

      const verifyD = await fetch(
        `${baseUrl}/api/v4/documents/${doc.id}.json?fields=id,latest_document_version{uuid,fully_uploaded}`,
        { headers: { Authorization: `Bearer ${accessToken}` } }
      );
      results.verify_after_D = await verifyD.json();
      const dWorked = (results.verify_after_D as { data?: { latest_document_version?: { fully_uploaded?: boolean } } })?.data?.latest_document_version?.fully_uploaded === true;
      results.patch_D_worked = dWorked;
    }

    // Clean up
    await fetch(`${baseUrl}/api/v4/documents/${doc.id}.json`, {
      method: 'DELETE', headers: { Authorization: `Bearer ${accessToken}` },
    });
    results.cleaned_up = true;

    return NextResponse.json(results, { status: 200 });
  } catch (err) {
    results.fatal_error = String(err);
    return NextResponse.json(results, { status: 500 });
  }
}
