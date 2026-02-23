'use server';

/**
 * Server Actions for Firm Operations (Platform Admin only)
 */

import { createClient } from '@/lib/supabase/server';
import { isPlatformAdmin } from '@/lib/auth/roles';
import type { UserRole } from '@/lib/auth/roles';

export interface Firm {
  id: string;
  name: string;
  jurisdiction: string;
}

export type GetAllFirmsResult =
  | { success: true; firms: Firm[] }
  | { success: false; error: string };

/**
 * Fetch all firms (platform_admin only, for the firm switcher)
 */
export async function getAllFirms(): Promise<GetAllFirmsResult> {
  try {
    const supabase = await createClient();

    const {
      data: { user },
      error: userErr,
    } = await supabase.auth.getUser();

    if (userErr || !user) {
      return { success: false, error: 'Not authenticated' };
    }

    const { data: profile, error: profileErr } = await supabase
      .from('user_profiles')
      .select('user_id, role')
      .eq('user_id', user.id)
      .single();

    if (profileErr || !profile) {
      return { success: false, error: 'User profile not found' };
    }

    if (!isPlatformAdmin(profile.role as UserRole)) {
      return { success: false, error: 'Forbidden' };
    }

    // RLS allows platform_admin to SELECT all firms
    const { data: firms, error: firmsErr } = await supabase
      .from('firms')
      .select('id, name, jurisdiction')
      .order('name');

    if (firmsErr || !firms) {
      return { success: false, error: 'Failed to load firms' };
    }

    return { success: true, firms: firms as Firm[] };
  } catch (error) {
    console.error('Error in getAllFirms:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error occurred',
    };
  }
}

export type SwitchFirmResult =
  | { success: true }
  | { success: false; error: string };

/**
 * Switch the platform admin's active firm by updating their firm_id
 */
export async function switchActiveFirm(firmId: string): Promise<SwitchFirmResult> {
  try {
    const supabase = await createClient();

    const {
      data: { user },
      error: userErr,
    } = await supabase.auth.getUser();

    if (userErr || !user) {
      return { success: false, error: 'Not authenticated' };
    }

    const { data: profile, error: profileErr } = await supabase
      .from('user_profiles')
      .select('user_id, role, firm_id')
      .eq('user_id', user.id)
      .single();

    if (profileErr || !profile) {
      return { success: false, error: 'User profile not found' };
    }

    if (!isPlatformAdmin(profile.role as UserRole)) {
      return { success: false, error: 'Forbidden' };
    }

    // Verify target firm exists (RLS allows platform_admin to see all firms)
    const { data: targetFirm, error: firmErr } = await supabase
      .from('firms')
      .select('id')
      .eq('id', firmId)
      .single();

    if (firmErr || !targetFirm) {
      return { success: false, error: 'Firm not found' };
    }

    // Update the platform admin's firm_id
    const { error: updateErr } = await supabase
      .from('user_profiles')
      .update({ firm_id: firmId })
      .eq('user_id', user.id);

    if (updateErr) {
      console.error('Failed to switch firm:', updateErr);
      return { success: false, error: 'Failed to switch firm' };
    }

    // Audit log
    await supabase.from('audit_events').insert({
      firm_id: firmId,
      entity_type: 'user_profile',
      entity_id: user.id,
      action: 'platform_admin_firm_switch',
      metadata: { from_firm_id: profile.firm_id, to_firm_id: firmId },
      created_by: user.id,
    });

    return { success: true };
  } catch (error) {
    console.error('Error in switchActiveFirm:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error occurred',
    };
  }
}
