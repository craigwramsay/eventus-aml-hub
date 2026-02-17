'use server';

/**
 * Server Actions for Matter Operations
 */

import { createClient } from '@/lib/supabase/server';
import type { Matter, Client, Assessment } from '@/lib/supabase/types';

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
      .select('*, client:clients(*)')
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
      .select('*, client:clients(*)')
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
