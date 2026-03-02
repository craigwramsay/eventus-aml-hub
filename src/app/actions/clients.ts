'use server';

/**
 * Server Actions for Client Operations
 * client_type is derived automatically from entity_type.
 */

import { createClient } from '@/lib/supabase/server';
import type { Client, Matter } from '@/lib/supabase/types';
import { canDeleteEntities } from '@/lib/auth/roles';
import type { UserRole } from '@/lib/auth/roles';
import {
  lookupCompany,
  isValidCompanyNumber,
  CompaniesHouseError,
} from '@/lib/companies-house/client';

/** Input for creating a client */
export interface CreateClientInput {
  name: string;
  entity_type: string;
  clio_contact_id?: string | null;
  registered_number?: string | null;
  registered_address?: string | null;
  trading_address?: string | null;
  sector?: string | null;
  aml_regulated?: boolean;
  last_cdd_verified_at?: string | null;
}

/** Result of creating a client */
export type CreateClientResult =
  | { success: true; client: Client }
  | { success: false; error: string };

/**
 * Fetch authenticated user + firm profile
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

  if (profileErr || !profile || !profile.firm_id) {
    return {
      supabase,
      user,
      profile: null,
      error: 'User profile not found or missing firm_id',
    };
  }

  return { supabase, user, profile, error: null };
}

/**
 * Create a new client
 */
export async function createClientAction(
  input: CreateClientInput
): Promise<CreateClientResult> {
  try {
    const { supabase, profile, error } = await getUserAndProfile();
    if (error || !profile) {
      return { success: false, error: error || 'User profile not found' };
    }

    const {
      name,
      entity_type,
      clio_contact_id,
      registered_number,
      registered_address,
      trading_address,
      sector,
      aml_regulated,
      last_cdd_verified_at,
    } = input;

    if (!name || !name.trim()) {
      return { success: false, error: 'Client name is required' };
    }

    if (!entity_type || !entity_type.trim()) {
      return { success: false, error: 'Client type is required' };
    }

    // Derive client_type
    const client_type: 'individual' | 'corporate' =
      entity_type.toLowerCase() === 'individual' ? 'individual' : 'corporate';

    const { data, error: insertErr } = await supabase
      .from('clients')
      .insert({
        firm_id: profile.firm_id,
        name: name.trim(),
        client_type,
        entity_type,
        clio_contact_id: clio_contact_id ?? null,
        registered_number: registered_number ?? null,
        registered_address: registered_address ?? null,
        trading_address: trading_address ?? null,
        sector: sector ?? null,
        aml_regulated: aml_regulated ?? null,
        last_cdd_verified_at: last_cdd_verified_at ?? null,
        updated_at: new Date().toISOString(),
      })
      .select()
      .single();

    if (insertErr || !data) {
      console.error('Failed to create client:', insertErr);
      return { success: false, error: 'Failed to create client' };
    }

    return { success: true, client: data as Client };
  } catch (error) {
    console.error('Error in createClientAction:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error occurred',
    };
  }
}

/**
 * Get all clients
 */
export async function getClients(): Promise<Client[]> {
  try {
    const { supabase, error } = await getUserAndProfile();
    if (error) return [];

    const { data } = await supabase
      .from('clients')
      .select('*')
      .order('name');

    return (data || []) as Client[];
  } catch {
    return [];
  }
}

/**
 * Get single client
 */
export async function getClient(clientId: string): Promise<Client | null> {
  try {
    if (!clientId) return null;

    const { supabase, error } = await getUserAndProfile();
    if (error) return null;

    const { data } = await supabase
      .from('clients')
      .select('*')
      .eq('id', clientId)
      .single();

    return data as Client;
  } catch {
    return null;
  }
}

/**
 * Get matters for client
 */
export async function getMattersForClient(clientId: string): Promise<Matter[]> {
  try {
    if (!clientId) return [];

    const { supabase, error } = await getUserAndProfile();
    if (error) return [];

    const { data } = await supabase
      .from('matters')
      .select('*')
      .eq('client_id', clientId)
      .order('created_at', { ascending: false });

    return (data || []) as Matter[];
  } catch {
    return [];
  }
}

/** Result of a Companies House lookup for the new-client form */
export type CompanyLookupForClientResult =
  | {
      success: true;
      companyName: string;
      companyNumber: string;
      companyStatus: string;
      registeredAddress: string;
      incorporationDate: string;
    }
  | { success: false; error: string };

/**
 * Look up a company at Companies House for the new-client form.
 * Keeps the API key server-side and returns a clean result for the UI.
 */
export async function lookupCompanyForClient(
  companyNumber: string
): Promise<CompanyLookupForClientResult> {
  try {
    const trimmed = companyNumber.trim().toUpperCase();

    if (!isValidCompanyNumber(trimmed)) {
      return {
        success: false,
        error:
          'Invalid company number format. Expected 8 digits (e.g. 12345678) or 2 letters + 6 digits (e.g. SC123456).',
      };
    }

    const result = await lookupCompany(trimmed);
    const addr = result.profile.registered_office_address;

    const addressParts = [
      addr.address_line_1,
      addr.address_line_2,
      addr.locality,
      addr.region,
      addr.postal_code,
    ].filter(Boolean);

    return {
      success: true,
      companyName: result.profile.company_name,
      companyNumber: result.profile.company_number,
      companyStatus: result.profile.company_status,
      registeredAddress: addressParts.join(', '),
      incorporationDate: result.profile.date_of_creation,
    };
  } catch (err) {
    if (err instanceof CompaniesHouseError) {
      if (err.statusCode === 404) {
        return { success: false, error: 'Company not found at Companies House' };
      }
      if (!process.env.COMPANIES_HOUSE_API_KEY) {
        return {
          success: false,
          error: 'Companies House lookup is not configured',
        };
      }
      return { success: false, error: err.message };
    }
    return { success: false, error: 'An unexpected error occurred during lookup' };
  }
}

/** Child entity counts for a client (used in delete confirmation UI) */
export interface ClientChildCounts {
  matterCount: number;
  assessmentCount: number;
}

/**
 * Get counts of matters and assessments for a client.
 * Used to display cascade warnings in the delete confirmation dialog.
 */
export async function getClientChildCounts(
  clientId: string
): Promise<ClientChildCounts> {
  try {
    if (!clientId) return { matterCount: 0, assessmentCount: 0 };

    const { supabase, error } = await getUserAndProfile();
    if (error) return { matterCount: 0, assessmentCount: 0 };

    const { data: matters } = await supabase
      .from('matters')
      .select('id')
      .eq('client_id', clientId);

    const matterCount = matters?.length ?? 0;

    if (matterCount === 0) {
      return { matterCount: 0, assessmentCount: 0 };
    }

    const matterIds = matters!.map((m) => m.id);

    const { count } = await supabase
      .from('assessments')
      .select('id', { count: 'exact', head: true })
      .in('matter_id', matterIds);

    return { matterCount, assessmentCount: count ?? 0 };
  } catch {
    return { matterCount: 0, assessmentCount: 0 };
  }
}

/** Result of deleting a client */
export type DeleteClientResult =
  | { success: true }
  | { success: false; error: string };

/**
 * Delete a client and all its matters and assessments (MLRO only).
 * Cascades: client → matters → assessments → evidence + progress → storage files.
 */
export async function deleteClient(
  clientId: string
): Promise<DeleteClientResult> {
  try {
    const { supabase, user, profile, error } = await getUserAndProfile();
    if (error || !user || !profile) {
      return { success: false, error: error || 'User profile not found' };
    }

    if (!canDeleteEntities(profile.role as UserRole)) {
      return { success: false, error: 'Only the MLRO can delete clients' };
    }

    // Fetch client, verify firm ownership
    const { data: client, error: fetchErr } = await supabase
      .from('clients')
      .select('*')
      .eq('id', clientId)
      .single();

    if (fetchErr || !client) {
      return { success: false, error: 'Client not found or access denied' };
    }

    if (client.firm_id !== profile.firm_id) {
      return { success: false, error: 'Client does not belong to your firm' };
    }

    // Fetch all matters for this client
    const { data: matters } = await supabase
      .from('matters')
      .select('id, reference')
      .eq('client_id', clientId);

    const matterIds = (matters || []).map((m) => m.id);
    let totalAssessmentsDeleted = 0;

    if (matterIds.length > 0) {
      // Fetch all assessments across all matters
      const { data: assessments } = await supabase
        .from('assessments')
        .select('id, matter_id, risk_level, finalised_at')
        .in('matter_id', matterIds);

      const assessmentIds = (assessments || []).map((a) => a.id);
      totalAssessmentsDeleted = assessmentIds.length;

      if (assessmentIds.length > 0) {
        // Fetch evidence file paths for storage cleanup
        const { data: evidenceRows } = await supabase
          .from('assessment_evidence')
          .select('id, file_path')
          .in('assessment_id', assessmentIds);

        // Delete CDD progress
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
              matter_id: a.matter_id,
              risk_level: a.risk_level,
              was_finalised: a.finalised_at !== null,
              deleted_via: 'client_cascade',
            },
            created_by: user.id,
          });
        }
      }

      // Delete matter rows
      await supabase
        .from('matters')
        .delete()
        .in('id', matterIds);

      // Audit log each matter deletion
      for (const m of matters || []) {
        await supabase.from('audit_events').insert({
          firm_id: profile.firm_id,
          entity_type: 'matter',
          entity_id: m.id,
          action: 'matter_deleted',
          metadata: {
            client_id: clientId,
            reference: m.reference,
            deleted_via: 'client_cascade',
          },
          created_by: user.id,
        });
      }
    }

    // Delete client row
    const { error: deleteErr } = await supabase
      .from('clients')
      .delete()
      .eq('id', clientId);

    if (deleteErr) {
      console.error('Failed to delete client:', deleteErr);
      return { success: false, error: 'Failed to delete client' };
    }

    // Audit log
    await supabase.from('audit_events').insert({
      firm_id: profile.firm_id,
      entity_type: 'client',
      entity_id: clientId,
      action: 'client_deleted',
      metadata: {
        name: client.name,
        client_type: client.client_type,
        matters_deleted: matterIds.length,
        assessments_deleted: totalAssessmentsDeleted,
      },
      created_by: user.id,
    });

    return { success: true };
  } catch (error) {
    console.error('Error in deleteClient:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error occurred',
    };
  }
}
