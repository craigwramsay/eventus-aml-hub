'use client';

import { useState } from 'react';
import { resendInvite, cancelInvite } from '@/app/actions/users';
import { ROLE_LABELS } from '@/lib/auth/roles';
import type { UserInvitation } from '@/lib/supabase/types';
import styles from './users.module.css';

interface Props {
  invitations: UserInvitation[];
}

type RowStatus = 'idle' | 'resending' | 'resent' | 'cancelling';

export default function InvitationsTable({ invitations: initial }: Props) {
  const [invitations, setInvitations] = useState(initial);
  const [rowStatus, setRowStatus] = useState<Record<string, RowStatus>>({});
  const [rowError, setRowError] = useState<Record<string, string>>({});

  async function handleResend(id: string) {
    setRowStatus((s) => ({ ...s, [id]: 'resending' }));
    setRowError((e) => ({ ...e, [id]: '' }));

    const result = await resendInvite(id);

    if (result.success) {
      setRowStatus((s) => ({ ...s, [id]: 'resent' }));
      setTimeout(() => setRowStatus((s) => ({ ...s, [id]: 'idle' })), 3000);
    } else {
      setRowError((e) => ({ ...e, [id]: result.error }));
      setRowStatus((s) => ({ ...s, [id]: 'idle' }));
    }
  }

  async function handleCancel(id: string, email: string) {
    const confirmed = window.confirm(
      `Cancel the invitation for ${email}? This cannot be undone.`
    );
    if (!confirmed) return;

    setRowStatus((s) => ({ ...s, [id]: 'cancelling' }));
    setRowError((e) => ({ ...e, [id]: '' }));

    const result = await cancelInvite(id);

    if (result.success) {
      setInvitations((prev) => prev.filter((inv) => inv.id !== id));
    } else {
      setRowError((e) => ({ ...e, [id]: result.error }));
      setRowStatus((s) => ({ ...s, [id]: 'idle' }));
    }
  }

  return (
    <section>
      <h2 className={styles.sectionTitle}>
        Pending Invitations ({invitations.length})
      </h2>
      {invitations.length === 0 ? (
        <p className={styles.emptyState}>No pending invitations.</p>
      ) : (
        <table className={styles.table}>
          <thead>
            <tr>
              <th>Email</th>
              <th>Role</th>
              <th>Invited</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {invitations.map((inv) => {
              const status = rowStatus[inv.id] || 'idle';
              const error = rowError[inv.id];
              return (
                <tr key={inv.id}>
                  <td>{inv.email}</td>
                  <td>{ROLE_LABELS[inv.role]}</td>
                  <td>
                    {new Date(inv.created_at).toLocaleDateString('en-GB')}
                  </td>
                  <td>
                    <div className={styles.actionsRow}>
                      <button
                        onClick={() => handleResend(inv.id)}
                        disabled={status !== 'idle'}
                        className={
                          status === 'resent'
                            ? styles.smallSuccessButton
                            : styles.smallButton
                        }
                      >
                        {status === 'resending'
                          ? 'Sending...'
                          : status === 'resent'
                            ? 'Resent!'
                            : 'Resend'}
                      </button>
                      <button
                        onClick={() => handleCancel(inv.id, inv.email)}
                        disabled={status !== 'idle'}
                        className={styles.smallDangerButton}
                      >
                        {status === 'cancelling' ? 'Cancelling...' : 'Cancel'}
                      </button>
                    </div>
                    {error && (
                      <p className={styles.actionsError}>{error}</p>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
    </section>
  );
}
