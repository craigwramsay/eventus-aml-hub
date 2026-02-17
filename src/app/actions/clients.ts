'use server';

/**
 * Server Actions for Client Operations
 * client_type is derived automatically from entity_type.
 */

import { createClient } from '@/lib/supabase/server';
import type { Client, Matter } from '@/lib/supabase/types';

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
    } = input;

    if (!name || !name.trim()) {
      return { success: false, error: 'Client name is required' };
    }

    if (!entity_type || !entity_type.trim()) {
      return { success: false, error: 'Client type is required' };
    }

    // Derive client_type
    const client_type: 'individual' | 'corporate' =
      entity_type === 'Individual' ? 'individual' : 'corporate';

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
        aml_regulated: aml_regulated ?? false,
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
