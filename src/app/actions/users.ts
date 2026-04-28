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
import { buildHubUrl } from '@/lib/url';
import { sendInvitationEmail } from '@/lib/email/resend';

const INVITE_TOKEN_TTL_DAYS = 7;

/** Generate a 64-character URL-safe random token. */
function generateInviteToken(): string {
  return crypto.randomUUID().replace(/-/g, '') + crypto.randomUUID().replace(/-/g, '');
}

function inviteExpiry(): Date {
  return new Date(Date.now() + INVITE_TOKEN_TTL_DAYS * 24 * 60 * 60 * 1000);
}

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
    .select('user_id, firm_id, role, full_name')
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

    // Check whether the email is already registered in auth.users globally.
    // If it is, the recipient won't be able to complete signup later (they'd
    // hit "User already registered"), so refuse upfront with a clear message.
    // Uses a SECURITY DEFINER RPC because the authenticated role can't read
    // auth.users directly.
    const { data: emailExists, error: emailCheckErr } = await supabase
      .rpc('email_in_auth_users', { target_email: email });

    if (emailCheckErr) {
      // Non-fatal — fall through to the invite attempt rather than blocking.
      // The user will hit a clear error at acceptance time if there's a
      // genuine conflict.
      console.warn('email_in_auth_users RPC failed (non-fatal):', emailCheckErr);
    } else if (emailExists === true) {
      return {
        success: false,
        error: 'This email is already registered. If they used to be a user, delete their account from the Hub first; otherwise ask them to sign in directly.',
      };
    }

    // Generate the invitation token and persist the row. We DO NOT call
    // Supabase signUp here — instead, the auth.users row is created when
    // the recipient submits their password on the /invite/[token] page.
    // This avoids Microsoft 365 Safe Links / similar pre-fetchers from
    // consuming Supabase's one-time-code email confirmation links.
    const inviteToken = generateInviteToken();
    const expiresAt = inviteExpiry();

    const { data: invitationRow, error: insertErr } = await supabase
      .from('user_invitations')
      .insert({
        firm_id: profile.firm_id,
        email,
        full_name,
        role,
        invited_by: user.id,
        invite_token: inviteToken,
        invite_token_expires_at: expiresAt.toISOString(),
      })
      .select()
      .single();

    if (insertErr || !invitationRow) {
      console.error('Failed to create invitation:', insertErr);
      return { success: false, error: 'Failed to create invitation' };
    }

    // Send the email. If this fails, surface the error and keep the row
    // in the DB so the admin can retry via "Resend" rather than having to
    // re-enter the email and role.
    try {
      await sendInvitationEmail({
        to: email,
        recipientName: full_name,
        inviteUrl: buildHubUrl(`/invite/${inviteToken}`),
        invitedByName: profile.full_name || null,
        expiresAt,
      });
    } catch (emailErr) {
      console.error('Failed to send invitation email:', emailErr);
      const message = emailErr instanceof Error ? emailErr.message : 'Unknown email error';
      return {
        success: false,
        error: `Invitation created but email delivery failed (${message}). Click "Resend" to retry.`,
      };
    }

    // Audit log
    await supabase.from('audit_events').insert({
      firm_id: profile.firm_id,
      entity_type: 'user_invitation',
      entity_id: invitationRow.id,
      action: 'user_invited',
      metadata: { email, role, full_name },
      created_by: user.id,
    });

    return { success: true, invitation: invitationRow as UserInvitation };
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
 * Resend an invitation email (admin-only).
 *
 * Regenerates the invite_token (so any leaked-but-unused old token
 * stops working) and pushes the expiry out by another TTL.
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

    // Regenerate token + extend expiry
    const newToken = generateInviteToken();
    const newExpiry = inviteExpiry();

    const { data: updateRows, error: updateErr } = await supabase
      .from('user_invitations')
      .update({
        invite_token: newToken,
        invite_token_expires_at: newExpiry.toISOString(),
      })
      .eq('id', invitationId)
      .select('id');

    if (updateErr) {
      console.error('Failed to update invitation token:', updateErr);
      return {
        success: false,
        error: `Failed to refresh invitation token: ${updateErr.message || updateErr.code || 'unknown error'}`,
      };
    }

    // RLS-blocked UPDATEs return success with 0 rows affected rather than an
    // error. Detect that explicitly so we don't silently send the email with
    // a stale token.
    if (!updateRows || updateRows.length === 0) {
      return {
        success: false,
        error: 'No rows updated — the admin update RLS policy may not be applied. Run migration 20260429_invitation_admin_update.sql in Supabase.',
      };
    }

    try {
      await sendInvitationEmail({
        to: invitation.email,
        recipientName: invitation.full_name,
        inviteUrl: buildHubUrl(`/invite/${newToken}`),
        invitedByName: profile.full_name || null,
        expiresAt: newExpiry,
      });
    } catch (emailErr) {
      console.error('Failed to resend invitation email:', emailErr);
      const message = emailErr instanceof Error ? emailErr.message : 'Unknown email error';
      return { success: false, error: `Email delivery failed: ${message}` };
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

    // Also purge any orphan auth.users row left behind by Supabase's signUp
    // when the invitee never accepted. Without this, re-inviting the same
    // email would silently no-op (anti-enumeration behaviour) and the
    // invitee would never receive a fresh email.
    // This RPC only deletes when the account is unconfirmed AND has no
    // user_profile, so it can't be used to revoke active accounts.
    const { error: purgeErr } = await supabase.rpc('admin_purge_unconfirmed_invite', {
      target_email: invitation.email,
    });
    if (purgeErr) {
      // Non-fatal — the invitation row is already removed, so the UI
      // state is consistent. Log so we know if the orphan cleanup is
      // failing in production.
      console.warn('admin_purge_unconfirmed_invite failed (non-fatal):', purgeErr);
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

    const redirectTo = buildHubUrl('/auth/callback?type=recovery');

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

export type DeleteUserResult =
  | { success: true }
  | { success: false; error: string };

/**
 * Permanently delete a user from the firm.
 *
 * Removes user_profiles, any pending user_invitations matching their email,
 * and the auth.users row itself (via the SECURITY DEFINER RPC
 * `admin_delete_firm_user`). Historical references (created_by columns
 * on assessments, evidence, audit events, etc.) are preserved by design
 * — those are plain uuid columns rather than foreign keys.
 *
 * Cannot delete:
 *   - Yourself
 *   - A user from a different firm (unless platform_admin)
 */
export async function deleteFirmUser(userId: string): Promise<DeleteUserResult> {
  try {
    const { supabase, user, profile, error } = await getUserAndProfile();
    if (error || !user || !profile) {
      return { success: false, error: error || 'Not authenticated' };
    }

    if (!canManageUsers(profile.role as UserRole)) {
      return { success: false, error: 'Only administrators can delete users' };
    }

    if (userId === user.id) {
      return { success: false, error: 'You cannot delete your own account' };
    }

    const { error: rpcErr } = await supabase.rpc('admin_delete_firm_user', {
      target_user_id: userId,
    });

    if (rpcErr) {
      console.error('admin_delete_firm_user failed:', rpcErr);
      return { success: false, error: rpcErr.message || 'Failed to delete user' };
    }

    return { success: true };
  } catch (error) {
    console.error('Error in deleteFirmUser:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error occurred',
    };
  }
}

// ────────────────────────────────────────────────────────
// Invitation acceptance flow (token-based)
// ────────────────────────────────────────────────────────

export interface AcceptInvitationInput {
  token: string;
  password: string;
}

export type AcceptInvitationResult =
  | { success: true; email: string }
  | { success: false; error: string };

/**
 * Validate an invitation token and create the user account.
 *
 * Called from the public /invite/[token] page after the recipient
 * enters their password. Uses the get_invitation_by_token RPC for the
 * read (token IS the access control), then calls supabase.auth.signUp
 * with the user's chosen password to create the auth.users row, then
 * accept_invitation_finalise RPC to insert the user_profile and mark
 * the invitation accepted atomically.
 *
 * Requires "Confirm email" to be DISABLED in the Supabase Auth project
 * settings — otherwise signUp would trigger a redundant confirmation
 * email. The token is itself proof of email ownership.
 */
export async function acceptInvitation(
  input: AcceptInvitationInput
): Promise<AcceptInvitationResult> {
  try {
    const { token, password } = input;

    if (!token || !password) {
      return { success: false, error: 'Token and password are required' };
    }

    if (password.length < 12) {
      return { success: false, error: 'Password must be at least 12 characters' };
    }

    // Use a fresh client (caller is unauthenticated at this point)
    const supabase = await createClient();

    // Look up the invitation via the public SECURITY DEFINER RPC
    const { data: invitations, error: lookupErr } = await supabase.rpc(
      'get_invitation_by_token',
      { target_token: token }
    );

    if (lookupErr) {
      console.error('Invitation lookup failed:', lookupErr);
      return { success: false, error: 'Failed to validate invitation' };
    }

    const invitation = Array.isArray(invitations) ? invitations[0] : null;
    if (!invitation) {
      return { success: false, error: 'Invitation not found or invalid' };
    }
    if (invitation.accepted_at) {
      return { success: false, error: 'Invitation has already been accepted' };
    }
    if (new Date(invitation.expires_at) < new Date()) {
      return { success: false, error: 'Invitation has expired — ask your administrator to resend' };
    }

    // Create the auth.users row. With "Confirm email" disabled in
    // Supabase, signUp auto-confirms and returns a session immediately.
    const { data: signUpData, error: signUpErr } = await supabase.auth.signUp({
      email: invitation.email,
      password,
    });

    if (signUpErr) {
      console.error('signUp failed during invitation acceptance:', signUpErr);
      return { success: false, error: signUpErr.message };
    }

    const newUserId = signUpData?.user?.id;
    if (!newUserId) {
      // Identity-empty response indicates a duplicate email — should be
      // rare since we checked at invite time, but guard anyway.
      return {
        success: false,
        error: 'Could not create account. The email may already be in use — contact your administrator.',
      };
    }

    // Finalise: validate token + insert profile + mark accepted (atomic)
    const { error: finaliseErr } = await supabase.rpc('accept_invitation_finalise', {
      target_token: token,
      target_user_id: newUserId,
    });

    if (finaliseErr) {
      console.error('accept_invitation_finalise failed:', finaliseErr);
      return {
        success: false,
        error: finaliseErr.message || 'Failed to finalise invitation acceptance',
      };
    }

    return { success: true, email: invitation.email };
  } catch (error) {
    console.error('Error in acceptInvitation:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error occurred',
    };
  }
}
