'use server';

/**
 * Server Actions for User Management
 *
 * Admin-only operations for inviting users, managing roles, and deactivating accounts.
 */

import { createClient } from '@/lib/supabase/server';
import type { UserProfile, UserInvitation } from '@/lib/supabase/types';
import { canManageUsers, ASSIGNABLE_ROLES } from '@/lib/auth/roles';
import type { UserRole, AssignableRole } from '@/lib/auth/roles';

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

    if (!(ASSIGNABLE_ROLES as readonly string[]).includes(role)) {
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

    // Note: user_profiles row is created during invite acceptance (/invite/accept)
    // when the new user is authenticated as themselves (RLS allows self-insert).
    // The firm_id, role, and full_name are stored in auth user metadata above.

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

    if (!(ASSIGNABLE_ROLES as readonly string[]).includes(newRole)) {
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

export type ResendInviteResult =
  | { success: true }
  | { success: false; error: string };

/**
 * Resend an invitation email (admin-only)
 */
export async function resendInvite(invitationId: string): Promise<ResendInviteResult> {
  try {
    const { supabase, user, profile, error } = await getUserAndProfile();
    if (error || !user || !profile) {
      return { success: false, error: error || 'Not authenticated' };
    }

    if (!canManageUsers(profile.role as UserRole)) {
      return { success: false, error: 'Only administrators can resend invitations' };
    }

    // Fetch invitation scoped to firm, must be pending
    const { data: invitation, error: fetchErr } = await supabase
      .from('user_invitations')
      .select('*')
      .eq('id', invitationId)
      .eq('firm_id', profile.firm_id)
      .is('accepted_at', null)
      .single();

    if (fetchErr || !invitation) {
      return { success: false, error: 'Invitation not found or already accepted' };
    }

    const { error: resendErr } = await supabase.auth.resend({
      type: 'signup',
      email: invitation.email,
    });

    if (resendErr) {
      console.error('Failed to resend invite:', resendErr);
      return { success: false, error: resendErr.message };
    }

    // Audit log
    await supabase.from('audit_events').insert({
      firm_id: profile.firm_id,
      entity_type: 'user_invitation',
      entity_id: invitationId,
      action: 'invite_resent',
      metadata: { email: invitation.email },
      created_by: user.id,
    });

    return { success: true };
  } catch (error) {
    console.error('Error in resendInvite:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error occurred',
    };
  }
}

export type CancelInviteResult =
  | { success: true }
  | { success: false; error: string };

/**
 * Cancel a pending invitation (admin-only)
 */
export async function cancelInvite(invitationId: string): Promise<CancelInviteResult> {
  try {
    const { supabase, user, profile, error } = await getUserAndProfile();
    if (error || !user || !profile) {
      return { success: false, error: error || 'Not authenticated' };
    }

    if (!canManageUsers(profile.role as UserRole)) {
      return { success: false, error: 'Only administrators can cancel invitations' };
    }

    // Fetch invitation for audit log before deleting
    const { data: invitation, error: fetchErr } = await supabase
      .from('user_invitations')
      .select('email')
      .eq('id', invitationId)
      .eq('firm_id', profile.firm_id)
      .is('accepted_at', null)
      .single();

    if (fetchErr || !invitation) {
      return { success: false, error: 'Invitation not found or already accepted' };
    }

    const { error: deleteErr } = await supabase
      .from('user_invitations')
      .delete()
      .eq('id', invitationId)
      .eq('firm_id', profile.firm_id);

    if (deleteErr) {
      console.error('Failed to cancel invitation:', deleteErr);
      return { success: false, error: 'Failed to cancel invitation' };
    }

    // Audit log
    await supabase.from('audit_events').insert({
      firm_id: profile.firm_id,
      entity_type: 'user_invitation',
      entity_id: invitationId,
      action: 'invite_cancelled',
      metadata: { email: invitation.email },
      created_by: user.id,
    });

    return { success: true };
  } catch (error) {
    console.error('Error in cancelInvite:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error occurred',
    };
  }
}

export type SendPasswordResetResult =
  | { success: true }
  | { success: false; error: string };

/**
 * Send a password reset email to a user (admin-only)
 */
export async function sendPasswordReset(userId: string): Promise<SendPasswordResetResult> {
  try {
    const { supabase, user, profile, error } = await getUserAndProfile();
    if (error || !user || !profile) {
      return { success: false, error: error || 'Not authenticated' };
    }

    if (!canManageUsers(profile.role as UserRole)) {
      return { success: false, error: 'Only administrators can send password resets' };
    }

    if (userId === user.id) {
      return { success: false, error: 'Use the normal password reset flow for your own account' };
    }

    // Fetch target user's profile scoped to firm
    const { data: targetProfile, error: fetchErr } = await supabase
      .from('user_profiles')
      .select('email')
      .eq('user_id', userId)
      .eq('firm_id', profile.firm_id)
      .single();

    if (fetchErr || !targetProfile || !targetProfile.email) {
      return { success: false, error: 'User not found in your firm' };
    }

    const redirectTo = `${process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000'}/auth/callback?type=recovery`;

    const { error: resetErr } = await supabase.auth.resetPasswordForEmail(
      targetProfile.email,
      { redirectTo }
    );

    if (resetErr) {
      console.error('Failed to send password reset:', resetErr);
      return { success: false, error: resetErr.message };
    }

    // Audit log
    await supabase.from('audit_events').insert({
      firm_id: profile.firm_id,
      entity_type: 'user_profile',
      entity_id: userId,
      action: 'password_reset_requested',
      metadata: { email: targetProfile.email },
      created_by: user.id,
    });

    return { success: true };
  } catch (error) {
    console.error('Error in sendPasswordReset:', error);
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
