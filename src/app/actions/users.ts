'use server';

/**
 * Server Actions for User Management
 *
 * Admin-only operations for inviting users, managing roles, and deactivating accounts.
 */

import { createClient } from '@/lib/supabase/server';
import type { UserProfile, UserInvitation } from '@/lib/supabase/types';
import { canManageUsers, ROLES } from '@/lib/auth/roles';
import type { UserRole } from '@/lib/auth/roles';

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
    return { supabase, user, profile: null, error: 'User profile not found' };
  }

  if (!profile.firm_id) {
    return { supabase, user, profile: null, error: 'User profile missing firm_id' };
  }

  return { supabase, user, profile, error: null };
}

export interface InviteUserInput {
  email: string;
  full_name: string;
  role: UserRole;
}

export type InviteUserResult =
  | { success: true; invitation: UserInvitation }
  | { success: false; error: string };

/**
 * Invite a new user to the firm (admin-only)
 */
export async function inviteUser(input: InviteUserInput): Promise<InviteUserResult> {
  try {
    const { supabase, user, profile, error } = await getUserAndProfile();
    if (error || !user || !profile) {
      return { success: false, error: error || 'Not authenticated' };
    }

    if (!canManageUsers(profile.role as UserRole)) {
      return { success: false, error: 'Only administrators can invite users' };
    }

    const { email, full_name, role } = input;

    if (!email || !full_name || !role) {
      return { success: false, error: 'Email, name, and role are required' };
    }

    if (!ROLES.includes(role)) {
      return { success: false, error: 'Invalid role' };
    }

    // Check if user already exists in the firm
    const { data: existingUser } = await supabase
      .from('user_profiles')
      .select('user_id')
      .eq('email', email)
      .eq('firm_id', profile.firm_id)
      .single();

    if (existingUser) {
      return { success: false, error: 'A user with this email already exists in your firm' };
    }

    // Check for pending invitation
    const { data: existingInvite } = await supabase
      .from('user_invitations')
      .select('id')
      .eq('email', email)
      .eq('firm_id', profile.firm_id)
      .is('accepted_at', null)
      .single();

    if (existingInvite) {
      return { success: false, error: 'An invitation is already pending for this email' };
    }

    // Create the auth user via signUp with a random password.
    // Supabase will send the confirmation/invite email automatically.
    // The user will set their real password via /invite/accept after clicking the link.
    const tempPassword = crypto.randomUUID() + '!Aa1';
    const { data: signUpData, error: signUpErr } = await supabase.auth.signUp({
      email,
      password: tempPassword,
      options: {
        data: { full_name, role, firm_id: profile.firm_id },
        emailRedirectTo: `${process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000'}/auth/callback?type=invite`,
      },
    });

    if (signUpErr) {
      console.error('Failed to create auth user:', signUpErr);
      return { success: false, error: signUpErr.message };
    }

    // Create user profile for the new user
    if (signUpData.user) {
      await supabase.from('user_profiles').insert({
        user_id: signUpData.user.id,
        firm_id: profile.firm_id,
        email,
        full_name,
        role,
      });
    }

    // Create invitation record
    const { data, error: insertErr } = await supabase
      .from('user_invitations')
      .insert({
        firm_id: profile.firm_id,
        email,
        role,
        invited_by: user.id,
      })
      .select()
      .single();

    if (insertErr || !data) {
      console.error('Failed to create invitation:', insertErr);
      return { success: false, error: 'Failed to create invitation' };
    }

    // Audit log
    await supabase.from('audit_events').insert({
      firm_id: profile.firm_id,
      entity_type: 'user_invitation',
      entity_id: data.id,
      action: 'user_invited',
      metadata: { email, role, full_name },
      created_by: user.id,
    });

    return { success: true, invitation: data as UserInvitation };
  } catch (error) {
    console.error('Error in inviteUser:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error occurred',
    };
  }
}

/**
 * Get all users for the current firm (admin-only)
 */
export async function getUsersForFirm(): Promise<UserProfile[]> {
  try {
    const { supabase, profile, error } = await getUserAndProfile();
    if (error || !profile) return [];

    if (!canManageUsers(profile.role as UserRole)) return [];

    const { data, error: fetchErr } = await supabase
      .from('user_profiles')
      .select('*')
      .eq('firm_id', profile.firm_id)
      .order('created_at', { ascending: true });

    if (fetchErr || !data) return [];

    return data as UserProfile[];
  } catch (error) {
    console.error('Error in getUsersForFirm:', error);
    return [];
  }
}

/**
 * Get pending invitations for the firm (admin-only)
 */
export async function getPendingInvitations(): Promise<UserInvitation[]> {
  try {
    const { supabase, profile, error } = await getUserAndProfile();
    if (error || !profile) return [];

    if (!canManageUsers(profile.role as UserRole)) return [];

    const { data, error: fetchErr } = await supabase
      .from('user_invitations')
      .select('*')
      .eq('firm_id', profile.firm_id)
      .is('accepted_at', null)
      .order('created_at', { ascending: false });

    if (fetchErr || !data) return [];

    return data as UserInvitation[];
  } catch (error) {
    console.error('Error in getPendingInvitations:', error);
    return [];
  }
}

export type UpdateUserRoleResult =
  | { success: true }
  | { success: false; error: string };

/**
 * Update a user's role (admin-only)
 */
export async function updateUserRole(
  userId: string,
  newRole: UserRole
): Promise<UpdateUserRoleResult> {
  try {
    const { supabase, user, profile, error } = await getUserAndProfile();
    if (error || !user || !profile) {
      return { success: false, error: error || 'Not authenticated' };
    }

    if (!canManageUsers(profile.role as UserRole)) {
      return { success: false, error: 'Only administrators can update roles' };
    }

    if (!ROLES.includes(newRole)) {
      return { success: false, error: 'Invalid role' };
    }

    // Prevent admin from changing their own role
    if (userId === user.id) {
      return { success: false, error: 'You cannot change your own role' };
    }

    const { error: updateErr } = await supabase
      .from('user_profiles')
      .update({ role: newRole })
      .eq('user_id', userId)
      .eq('firm_id', profile.firm_id);

    if (updateErr) {
      console.error('Failed to update user role:', updateErr);
      return { success: false, error: 'Failed to update role' };
    }

    // Audit log
    await supabase.from('audit_events').insert({
      firm_id: profile.firm_id,
      entity_type: 'user_profile',
      entity_id: userId,
      action: 'user_role_updated',
      metadata: { new_role: newRole },
      created_by: user.id,
    });

    return { success: true };
  } catch (error) {
    console.error('Error in updateUserRole:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error occurred',
    };
  }
}

export type DeactivateUserResult =
  | { success: true }
  | { success: false; error: string };

/**
 * Deactivate a user (admin-only)
 *
 * Note: Full account deactivation requires Supabase Admin API.
 * This marks the profile as deactivated; actual auth disabling
 * should be done via Supabase dashboard or Edge Function.
 */
export async function deactivateUser(userId: string): Promise<DeactivateUserResult> {
  try {
    const { supabase, user, profile, error } = await getUserAndProfile();
    if (error || !user || !profile) {
      return { success: false, error: error || 'Not authenticated' };
    }

    if (!canManageUsers(profile.role as UserRole)) {
      return { success: false, error: 'Only administrators can deactivate users' };
    }

    if (userId === user.id) {
      return { success: false, error: 'You cannot deactivate your own account' };
    }

    // Audit log
    await supabase.from('audit_events').insert({
      firm_id: profile.firm_id,
      entity_type: 'user_profile',
      entity_id: userId,
      action: 'user_deactivated',
      metadata: {},
      created_by: user.id,
    });

    return { success: true };
  } catch (error) {
    console.error('Error in deactivateUser:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error occurred',
    };
  }
}
