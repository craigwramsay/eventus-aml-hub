import { NextRequest, NextResponse } from 'next/server';
import { promises as fs } from 'fs';
import path from 'path';
import { getUser, getUserProfile, createClient } from '@/lib/supabase/server';
import { canManageUsers } from '@/lib/auth/roles';
import type { UserRole } from '@/lib/auth/roles';
import {
  bulkCreateAssistantSources,
  deleteAssistantSources,
} from '@/app/actions/assistant-sources';
import type { CreateAssistantSourceInput } from '@/app/actions/assistant-sources';

/**
 * POST /api/admin/ingest-sources
 *
 * Admin endpoint to bulk-ingest assistant sources from scripts/ingestion-output.json.
 *
 * Body: { clear?: boolean }  — if true, deletes existing sources before inserting.
 *
 * Usage (two-step):
 *   1. npm run ingest:excerpts           → generates scripts/ingestion-output.json
 *   2. POST /api/admin/ingest-sources    → inserts into assistant_sources table
 */
export async function POST(request: NextRequest) {
  try {
    // Auth: must be logged in
    const user = await getUser();
    if (!user) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }

    const profile = await getUserProfile();
    if (!profile) {
      return NextResponse.json({ error: 'User profile not found' }, { status: 401 });
    }

    // Role check: admin or platform_admin only
    if (!canManageUsers(profile.role as UserRole)) {
      return NextResponse.json({ error: 'Admin access required' }, { status: 403 });
    }

    // Parse optional body
    let clear = false;
    try {
      const body = await request.json();
      clear = body?.clear === true;
    } catch {
      // No body or invalid JSON — default to clear=false
    }

    // Read ingestion output file
    const filePath = path.resolve(process.cwd(), 'scripts/ingestion-output.json');
    let fileContent: string;
    try {
      fileContent = await fs.readFile(filePath, 'utf-8');
    } catch {
      return NextResponse.json(
        { error: 'scripts/ingestion-output.json not found. Run `npm run ingest:excerpts` first.' },
        { status: 404 }
      );
    }

    const records: CreateAssistantSourceInput[] = JSON.parse(fileContent);

    if (!Array.isArray(records) || records.length === 0) {
      return NextResponse.json(
        { error: 'ingestion-output.json is empty or invalid' },
        { status: 400 }
      );
    }

    // Optionally clear existing sources
    if (clear) {
      const deleteResult = await deleteAssistantSources();
      if (!deleteResult.success) {
        return NextResponse.json(
          { error: `Failed to clear existing sources: ${deleteResult.error}` },
          { status: 500 }
        );
      }
    }

    // Bulk insert
    const result = await bulkCreateAssistantSources(records);

    if (!result.success) {
      return NextResponse.json(
        { error: result.error },
        { status: 500 }
      );
    }

    // Audit log
    const supabase = await createClient();
    await supabase.from('audit_events').insert({
      firm_id: profile.firm_id,
      entity_type: 'assistant_source',
      entity_id: profile.firm_id,
      action: 'sources_ingested',
      metadata: {
        inserted: result.count,
        cleared_first: clear,
        source_file: 'scripts/ingestion-output.json',
      },
      performed_by: user.id,
    });

    return NextResponse.json({
      success: true,
      inserted: result.count,
      cleared_first: clear,
    });
  } catch (error) {
    console.error('Error in ingest-sources:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}
