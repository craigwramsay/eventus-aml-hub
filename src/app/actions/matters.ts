'use server';

/**
 * Server Actions for Matter Operations
 */

import { createClient } from '@/lib/supabase/server';
import type { Matter, Client, Assessment } from '@/lib/supabase/types';
import { canDeleteEntities } from '@/lib/auth/roles';
import type { UserRole } from '@/lib/auth/roles';

/** Matter with joined client data */
export interface MatterWithClient extends Matter {
  client: Client;
}

/** Input for creating a matter */
export interface CreateMatterInput {
  client_id: string;
  description?: string;
}

/** Result of creating a matter */
export type CreateMatterResult =
  | { success: true; matter: Matter }
  | { success: false; error: string };

/**
 * Fetch the authenticated user + their user_profiles row (firm scoped)
 */
async function getUserAndProfile() {
  const supabase = await createClient();

  const {
    data: { user },
    error: userErr,
  } = await supabase.auth.getUser();

  if (userErr || !user) {
    return { supabase, user: null, profile: null, error: 'Not authenticated' };
  }

  const { data: profile, error: profileErr } = await supabase
    .from('user_profiles')
    .select('user_id, firm_id, role')
    .eq('user_id', user.id)
    .single();

  if (profileErr || !profile) {
    return {
      supabase,
      user,
      profile: null,
      error: 'User profile not found',
    };
  }

  if (!profile.firm_id) {
    return {
      supabase,
      user,
      profile: null,
      error: 'User profile missing firm_id',
    };
  }

  return { supabase, user, profile, error: null };
}

/**
 * Generate a unique matter reference
 */
function generateMatterRef(): string {
  const timestamp = Date.now().toString(36).toUpperCase();
  const random = Math.random().toString(36).substring(2, 6).toUpperCase();
  return `M-${timestamp}-${random}`;
}

/**
 * Create a new matter
 */
export async function createMatterAction(
  input: CreateMatterInput
): Promise<CreateMatterResult> {
  try {
    const { supabase, profile, error } = await getUserAndProfile();
    if (error || !profile) {
      return { success: false, error: error || 'User profile not found' };
    }

    const { client_id, description } = input;

    if (!client_id) {
      return { success: false, error: 'Client is required' };
    }

    // Verify client exists and belongs to the same firm
    const { data: client, error: clientErr } = await supabase
      .from('clients')
      .select('id, firm_id')
      .eq('id', client_id)
      .single();

    if (clientErr || !client) {
      return { success: false, error: 'Client not found' };
    }

    if (client.firm_id !== profile.firm_id) {
      return { success: false, error: 'Client does not belong to your firm' };
    }

    const { data, error: insertErr } = await supabase
      .from('matters')
      .insert({
        firm_id: profile.firm_id,
        client_id,
        reference: generateMatterRef(),
        description: description?.trim() || null,
        status: 'open',
      })
      .select()
      .single();

    if (insertErr || !data) {
      console.error('Failed to create matter:', insertErr);
      return { success: false, error: 'Failed to create matter' };
    }

    return { success: true, matter: data as Matter };
  } catch (error) {
    console.error('Error in createMatterAction:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error occurred',
    };
  }
}

/**
 * Get all matters for the current user's firm with client data
 */
export async function getMatters(): Promise<MatterWithClient[]> {
  try {
    const { supabase, error } = await getUserAndProfile();
    if (error) return [];

    const { data, error: fetchErr } = await supabase
      .from('matters')
      .select('*, client:clients!matters_client_id_fkey(*)')
      .order('created_at', { ascending: false });

    if (fetchErr || !data) {
      console.error('Failed to get matters:', fetchErr);
      return [];
    }

    return data as MatterWithClient[];
  } catch (error) {
    console.error('Error in getMatters:', error);
    return [];
  }
}

/**
 * Get a single matter by ID with client data
 */
export async function getMatter(matterId: string): Promise<MatterWithClient | null> {
  try {
    if (!matterId) return null;

    const { supabase, error } = await getUserAndProfile();
    if (error) return null;

    const { data, error: fetchErr } = await supabase
      .from('matters')
      .select('*, client:clients!matters_client_id_fkey(*)')
      .eq('id', matterId)
      .single();

    if (fetchErr || !data) {
      return null;
    }

    return data as MatterWithClient;
  } catch (error) {
    console.error('Error in getMatter:', error);
    return null;
  }
}

/**
 * Get all matters for a specific client
 */
export async function getMattersForClient(clientId: string): Promise<Matter[]> {
  try {
    if (!clientId) return [];

    const { supabase, error } = await getUserAndProfile();
    if (error) return [];

    const { data, error: fetchErr } = await supabase
      .from('matters')
      .select('*')
      .eq('client_id', clientId)
      .order('created_at', { ascending: false });

    if (fetchErr || !data) {
      console.error('Failed to get matters for client:', fetchErr);
      return [];
    }

    return data as Matter[];
  } catch (error) {
    console.error('Error in getMattersForClient:', error);
    return [];
  }
}

/**
 * Get all assessments for a matter
 */
export async function getAssessmentsForMatter(matterId: string): Promise<Assessment[]> {
  try {
    if (!matterId) return [];

    const { supabase, error } = await getUserAndProfile();
    if (error) return [];

    const { data, error: fetchErr } = await supabase
      .from('assessments')
      .select('*')
      .eq('matter_id', matterId)
      .order('created_at', { ascending: false });

    if (fetchErr || !data) {
      console.error('Failed to get assessments for matter:', fetchErr);
      return [];
    }

    return data as Assessment[];
  } catch (error) {
    console.error('Error in getAssessmentsForMatter:', error);
    return [];
  }
}

/**
 * Get the latest finalised assessment across all matters for a given client
 */
export async function getLatestFinalisedAssessmentForClient(
  clientId: string
): Promise<{ finalised_at: string; risk_level: string } | null> {
  try {
    if (!clientId) return null;

    const { supabase, error } = await getUserAndProfile();
    if (error) return null;

    // Get all matters for this client
    const { data: matters } = await supabase
      .from('matters')
      .select('id')
      .eq('client_id', clientId);

    if (!matters || matters.length === 0) return null;

    const matterIds = matters.map((m) => m.id);

    // Find the latest finalised assessment
    const { data, error: fetchErr } = await supabase
      .from('assessments')
      .select('finalised_at, risk_level')
      .in('matter_id', matterIds)
      .not('finalised_at', 'is', null)
      .order('finalised_at', { ascending: false })
      .limit(1)
      .single();

    if (fetchErr || !data) return null;

    return { finalised_at: data.finalised_at!, risk_level: data.risk_level };
  } catch {
    return null;
  }
}

/** Result of deleting a matter */
export type DeleteMatterResult =
  | { success: true }
  | { success: false; error: string };

/**
 * Delete a matter and all its assessments (MLRO only).
 * Cascades: assessments → evidence + progress → storage files.
 */
export async function deleteMatter(
  matterId: string
): Promise<DeleteMatterResult> {
  try {
    const { supabase, user, profile, error } = await getUserAndProfile();
    if (error || !user || !profile) {
      return { success: false, error: error || 'User profile not found' };
    }

    if (!canDeleteEntities(profile.role as UserRole)) {
      return { success: false, error: 'Only the MLRO can delete matters' };
    }

    // Fetch matter, verify firm ownership
    const { data: matter, error: fetchErr } = await supabase
      .from('matters')
      .select('*')
      .eq('id', matterId)
      .single();

    if (fetchErr || !matter) {
      return { success: false, error: 'Matter not found or access denied' };
    }

    if (matter.firm_id !== profile.firm_id) {
      return { success: false, error: 'Matter does not belong to your firm' };
    }

    // Fetch all assessments for this matter
    const { data: assessments } = await supabase
      .from('assessments')
      .select('id, risk_level, finalised_at')
      .eq('matter_id', matterId);

    const assessmentIds = (assessments || []).map((a) => a.id);

    if (assessmentIds.length > 0) {
      // Fetch evidence file paths for storage cleanup
      const { data: evidenceRows } = await supabase
        .from('assessment_evidence')
        .select('id, file_path, assessment_id')
        .in('assessment_id', assessmentIds);

      // Delete CDD progress for all assessments
      await supabase
        .from('cdd_item_progress')
        .delete()
        .in('assessment_id', assessmentIds);

      // Delete evidence rows
      await supabase
        .from('assessment_evidence')
        .delete()
        .in('assessment_id', assessmentIds);

      // Remove storage files (best-effort)
      const filePaths = (evidenceRows || [])
        .map((e) => e.file_path)
        .filter((p): p is string => !!p);

      if (filePaths.length > 0) {
        await supabase.storage.from('evidence').remove(filePaths);
      }

      // Delete assessment rows
      await supabase
        .from('assessments')
        .delete()
        .in('id', assessmentIds);

      // Audit log each assessment deletion
      for (const a of assessments || []) {
        await supabase.from('audit_events').insert({
          firm_id: profile.firm_id,
          entity_type: 'assessment',
          entity_id: a.id,
          action: 'assessment_deleted',
          metadata: {
            matter_id: matterId,
            risk_level: a.risk_level,
            was_finalised: a.finalised_at !== null,
            deleted_via: 'matter_cascade',
          },
          created_by: user.id,
        });
      }
    }

    // Delete matter row
    const { error: deleteErr } = await supabase
      .from('matters')
      .delete()
      .eq('id', matterId);

    if (deleteErr) {
      console.error('Failed to delete matter:', deleteErr);
      return { success: false, error: 'Failed to delete matter' };
    }

    // Audit log
    await supabase.from('audit_events').insert({
      firm_id: profile.firm_id,
      entity_type: 'matter',
      entity_id: matterId,
      action: 'matter_deleted',
      metadata: {
        client_id: matter.client_id,
        reference: matter.reference,
        assessments_deleted: assessmentIds.length,
      },
      created_by: user.id,
    });

    return { success: true };
  } catch (error) {
    console.error('Error in deleteMatter:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error occurred',
    };
  }
}

/**
 * A party (primary or co-) on a matter. The matter's primary client comes
 * from matters.client_id (Clio-sourced); co-clients come from the
 * matter_co_clients join table.
 */
export interface MatterParty {
  client: Client;
  role: 'primary' | 'co_client';
  addedAt: string | null;
  addedBy: string | null;
}

export type AddCoClientResult =
  | { success: true; clientId: string }
  | { success: false; error: string };

export type RemoveCoClientResult =
  | { success: true }
  | { success: false; error: string };

/**
 * Fetch the full party list for a matter — primary + co-clients — in a
 * single response with full Client objects. Primary is always first.
 */
export async function getMatterParties(matterId: string): Promise<MatterParty[]> {
  try {
    if (!matterId) return [];
    const { supabase, error } = await getUserAndProfile();
    if (error) return [];

    // Matter + primary client
    const { data: matter } = await supabase
      .from('matters')
      .select('client_id, client:clients!matters_client_id_fkey(*)')
      .eq('id', matterId)
      .single();
    type MatterRow = { client_id: string; client: Client | Client[] | null };
    const matterRow = matter as MatterRow | null;
    if (!matterRow) return [];

    const primaryClient = Array.isArray(matterRow.client) ? matterRow.client[0] : matterRow.client;

    // Co-clients (with their full client rows)
    const { data: coRows } = await supabase
      .from('matter_co_clients')
      .select('client_id, created_at, created_by, client:clients!matter_co_clients_client_id_fkey(*)')
      .eq('matter_id', matterId)
      .order('created_at', { ascending: true });

    type CoRow = {
      client_id: string;
      created_at: string;
      created_by: string | null;
      client: Client | Client[] | null;
    };
    const coClients = (coRows || []) as CoRow[];

    const parties: MatterParty[] = [];
    if (primaryClient) {
      parties.push({ client: primaryClient, role: 'primary', addedAt: null, addedBy: null });
    }
    for (const row of coClients) {
      const c = Array.isArray(row.client) ? row.client[0] : row.client;
      if (!c) continue;
      // Defensive: don't list the primary again as a co-client if the join
      // table somehow contains it.
      if (primaryClient && c.id === primaryClient.id) continue;
      parties.push({
        client: c,
        role: 'co_client',
        addedAt: row.created_at,
        addedBy: row.created_by,
      });
    }
    return parties;
  } catch (err) {
    console.error('Error in getMatterParties:', err);
    return [];
  }
}

/**
 * Add a co-client to a matter. Co-clients are additional parties on the
 * matter for AML purposes (joint sellers, co-applicants, etc.) — Clio still
 * only knows about the primary.
 *
 * Guards:
 *   - Matter and client both belong to the user's firm
 *   - Can't add the primary client as a co-client (the join would be redundant)
 *   - Duplicate adds are a no-op (returns success with the existing client_id)
 */
export async function addCoClientToMatter(
  matterId: string,
  clientId: string
): Promise<AddCoClientResult> {
  try {
    const { supabase, user, profile, error } = await getUserAndProfile();
    if (error || !user || !profile) {
      return { success: false, error: error || 'User profile not found' };
    }

    if (!matterId || !clientId) {
      return { success: false, error: 'matterId and clientId are required' };
    }

    // Verify matter
    const { data: matter, error: matterErr } = await supabase
      .from('matters')
      .select('id, firm_id, client_id')
      .eq('id', matterId)
      .single();
    if (matterErr || !matter) {
      return { success: false, error: 'Matter not found or access denied' };
    }
    if (matter.firm_id !== profile.firm_id) {
      return { success: false, error: 'Matter does not belong to your firm' };
    }
    if (matter.client_id === clientId) {
      return { success: false, error: 'This client is already the primary on this matter' };
    }

    // Verify client
    const { data: client, error: clientErr } = await supabase
      .from('clients')
      .select('id, firm_id')
      .eq('id', clientId)
      .single();
    if (clientErr || !client) {
      return { success: false, error: 'Client not found or access denied' };
    }
    if (client.firm_id !== profile.firm_id) {
      return { success: false, error: 'Client does not belong to your firm' };
    }

    // Check existing
    const { data: existing } = await supabase
      .from('matter_co_clients')
      .select('matter_id')
      .eq('matter_id', matterId)
      .eq('client_id', clientId)
      .maybeSingle();
    if (existing) {
      return { success: true, clientId };
    }

    const { error: insertErr } = await supabase
      .from('matter_co_clients')
      .insert({ matter_id: matterId, client_id: clientId, created_by: user.id });
    if (insertErr) {
      console.error('Failed to add co-client:', insertErr);
      return { success: false, error: 'Failed to add co-client' };
    }

    await supabase.from('audit_events').insert({
      firm_id: profile.firm_id,
      entity_type: 'matter',
      entity_id: matterId,
      action: 'co_client_added',
      metadata: { client_id: clientId },
      created_by: user.id,
    });

    return { success: true, clientId };
  } catch (err) {
    console.error('Error in addCoClientToMatter:', err);
    return {
      success: false,
      error: err instanceof Error ? err.message : 'Unknown error occurred',
    };
  }
}

/**
 * Remove a co-client from a matter. Does NOT delete the client record itself —
 * only the matter↔client join. The client may still be primary or co-client on
 * other matters.
 */
export async function removeCoClientFromMatter(
  matterId: string,
  clientId: string
): Promise<RemoveCoClientResult> {
  try {
    const { supabase, user, profile, error } = await getUserAndProfile();
    if (error || !user || !profile) {
      return { success: false, error: error || 'User profile not found' };
    }

    // Firm-ownership check via matter
    const { data: matter, error: matterErr } = await supabase
      .from('matters')
      .select('id, firm_id')
      .eq('id', matterId)
      .single();
    if (matterErr || !matter) {
      return { success: false, error: 'Matter not found or access denied' };
    }
    if (matter.firm_id !== profile.firm_id) {
      return { success: false, error: 'Matter does not belong to your firm' };
    }

    const { error: deleteErr } = await supabase
      .from('matter_co_clients')
      .delete()
      .eq('matter_id', matterId)
      .eq('client_id', clientId);
    if (deleteErr) {
      console.error('Failed to remove co-client:', deleteErr);
      return { success: false, error: 'Failed to remove co-client' };
    }

    await supabase.from('audit_events').insert({
      firm_id: profile.firm_id,
      entity_type: 'matter',
      entity_id: matterId,
      action: 'co_client_removed',
      metadata: { client_id: clientId },
      created_by: user.id,
    });

    return { success: true };
  } catch (err) {
    console.error('Error in removeCoClientFromMatter:', err);
    return {
      success: false,
      error: err instanceof Error ? err.message : 'Unknown error occurred',
    };
  }
}

/**
 * Search Hub clients in the firm by name (case-insensitive contains).
 * Used by the co-client picker on the matter detail page so the user can
 * find existing Hub clients without leaving the page.
 *
 * Excludes the primary client of the matter and any clients already on
 * the co-client list (caller supplies excludeClientIds).
 */
export async function searchHubClientsByName(
  query: string,
  excludeClientIds: string[] = [],
  limit = 10
): Promise<Client[]> {
  try {
    const trimmed = (query ?? '').trim();
    if (trimmed.length < 2) return [];

    const { supabase, profile, error } = await getUserAndProfile();
    if (error || !profile) return [];

    let q = supabase
      .from('clients')
      .select('*')
      .eq('firm_id', profile.firm_id)
      .ilike('name', `%${trimmed}%`)
      .order('name')
      .limit(limit);

    if (excludeClientIds.length > 0) {
      q = q.not('id', 'in', `(${excludeClientIds.map((id) => `"${id}"`).join(',')})`);
    }

    const { data } = await q;
    return (data || []) as Client[];
  } catch (err) {
    console.error('Error in searchHubClientsByName:', err);
    return [];
  }
}
