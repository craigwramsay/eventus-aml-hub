'use client';

import { useState } from 'react';
import { resendInvite, cancelInvite } from '@/app/actions/users';
import { ROLE_LABELS } from '@/lib/auth/roles';
import type { UserInvitation } from '@/lib/supabase/types';

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
      <h2 style={{ fontSize: '1.25rem', marginBottom: '1rem' }}>
        Pending Invitations ({invitations.length})
      </h2>
      {invitations.length === 0 ? (
        <p style={{ color: '#666' }}>No pending invitations.</p>
      ) : (
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ borderBottom: '2px solid #e5e5e5', textAlign: 'left' }}>
              <th style={{ padding: '0.75rem' }}>Email</th>
              <th style={{ padding: '0.75rem' }}>Role</th>
              <th style={{ padding: '0.75rem' }}>Invited</th>
              <th style={{ padding: '0.75rem' }}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {invitations.map((inv) => {
              const status = rowStatus[inv.id] || 'idle';
              const error = rowError[inv.id];
              return (
                <tr key={inv.id} style={{ borderBottom: '1px solid #e5e5e5' }}>
                  <td style={{ padding: '0.75rem' }}>{inv.email}</td>
                  <td style={{ padding: '0.75rem' }}>{ROLE_LABELS[inv.role]}</td>
                  <td style={{ padding: '0.75rem' }}>
                    {new Date(inv.created_at).toLocaleDateString('en-GB')}
                  </td>
                  <td style={{ padding: '0.75rem' }}>
                    <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                      <button
                        onClick={() => handleResend(inv.id)}
                        disabled={status !== 'idle'}
                        style={{
                          padding: '0.375rem 0.75rem',
                          backgroundColor: status === 'resent' ? '#d1fae5' : '#e0e7ff',
                          color: status === 'resent' ? '#065f46' : '#3730a3',
                          border: 'none',
                          borderRadius: '0.25rem',
                          cursor: status !== 'idle' ? 'not-allowed' : 'pointer',
                          fontSize: '0.8125rem',
                        }}
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
                        style={{
                          padding: '0.375rem 0.75rem',
                          backgroundColor: '#fee2e2',
                          color: '#991b1b',
                          border: 'none',
                          borderRadius: '0.25rem',
                          cursor: status !== 'idle' ? 'not-allowed' : 'pointer',
                          fontSize: '0.8125rem',
                        }}
                      >
                        {status === 'cancelling' ? 'Cancelling...' : 'Cancel'}
                      </button>
                    </div>
                    {error && (
                      <p style={{ color: '#991b1b', fontSize: '0.75rem', margin: '0.25rem 0 0' }}>
                        {error}
                      </p>
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
