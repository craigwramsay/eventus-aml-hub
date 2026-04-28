/**
 * Token-based invitation acceptance page.
 *
 * The recipient lands here from the link in their invitation email.
 * The token in the URL is the proof of email ownership — anyone with
 * the link can complete the invitation. We validate the token via the
 * SECURITY DEFINER RPC `get_invitation_by_token`, then render either
 * a status message (already accepted / expired / invalid) or the
 * password form that completes the signup.
 *
 * GET requests on this URL are idempotent — Microsoft 365 Safe Links
 * and similar email-link pre-fetchers can hit this endpoint as many
 * times as they like without consuming the invitation. Acceptance
 * only happens on the authenticated form POST.
 */

import Link from 'next/link';
import { createClient } from '@/lib/supabase/server';
import { ROLE_LABELS } from '@/lib/auth/roles';
import type { UserRole } from '@/lib/auth/roles';
import SetPasswordForm from './SetPasswordForm';
import styles from './invite.module.css';

interface PageProps {
  params: Promise<{ token: string }>;
}

interface Invitation {
  id: string;
  email: string;
  full_name: string | null;
  role: UserRole;
  expires_at: string;
  accepted_at: string | null;
}

export default async function AcceptInvitationPage({ params }: PageProps) {
  const { token } = await params;

  const supabase = await createClient();
  const { data, error } = await supabase.rpc('get_invitation_by_token', {
    target_token: token,
  });

  const invitation: Invitation | null = Array.isArray(data) && data.length > 0
    ? (data[0] as Invitation)
    : null;

  if (error || !invitation) {
    return (
      <Shell title="Invalid invitation">
        <p className={styles.body}>
          This invitation link is not valid. It may have been mistyped or already revoked.
        </p>
        <p className={styles.body}>
          Contact the administrator who sent it for a new invitation.
        </p>
        <Link href="/login" className={styles.secondaryLink}>
          Go to sign in
        </Link>
      </Shell>
    );
  }

  if (invitation.accepted_at) {
    return (
      <Shell title="Invitation already accepted">
        <p className={styles.body}>
          This invitation has already been used to create an account. If that was you,
          you can sign in below. If you weren't expecting this, contact your administrator.
        </p>
        <Link href="/login" className={styles.primaryLink}>
          Sign in
        </Link>
      </Shell>
    );
  }

  if (new Date(invitation.expires_at) < new Date()) {
    return (
      <Shell title="Invitation expired">
        <p className={styles.body}>
          This invitation expired on{' '}
          {new Date(invitation.expires_at).toLocaleDateString('en-GB', {
            day: 'numeric',
            month: 'long',
            year: 'numeric',
          })}
          .
        </p>
        <p className={styles.body}>
          Contact your administrator and ask them to resend the invitation.
        </p>
      </Shell>
    );
  }

  // Valid invitation — show the password form
  return (
    <Shell title="Accept your invitation">
      <p className={styles.body}>
        You're being invited to AML Hub as{' '}
        <strong>{ROLE_LABELS[invitation.role] || invitation.role}</strong>.
      </p>
      <dl className={styles.summary}>
        <div className={styles.summaryRow}>
          <dt>Name</dt>
          <dd>{invitation.full_name || '—'}</dd>
        </div>
        <div className={styles.summaryRow}>
          <dt>Email</dt>
          <dd>{invitation.email}</dd>
        </div>
      </dl>
      <SetPasswordForm token={token} email={invitation.email} />
    </Shell>
  );
}

function Shell({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className={styles.container}>
      <div className={styles.card}>
        <h1 className={styles.title}>{title}</h1>
        {children}
      </div>
    </div>
  );
}
