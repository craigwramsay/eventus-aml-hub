/**
 * User Management Page (Admin Only)
 */

import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getUserProfile } from '@/lib/supabase/server';
import { canManageUsers, ROLE_LABELS } from '@/lib/auth/roles';
import { getUsersForFirm, getPendingInvitations } from '@/app/actions/users';

export default async function UsersPage() {
  const profile = await getUserProfile();

  if (!profile) {
    redirect('/login');
  }

  if (!canManageUsers(profile.role)) {
    redirect('/dashboard');
  }

  const [users, invitations] = await Promise.all([
    getUsersForFirm(),
    getPendingInvitations(),
  ]);

  return (
    <div style={{ maxWidth: '800px', margin: '0 auto', padding: '2rem' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2rem' }}>
        <div>
          <h1 style={{ margin: 0, fontSize: '1.75rem' }}>User Management</h1>
          <Link href="/dashboard" style={{ fontSize: '0.875rem', color: '#6366f1' }}>
            &larr; Dashboard
          </Link>
        </div>
        <Link
          href="/users/invite"
          style={{
            padding: '0.75rem 1.5rem',
            backgroundColor: '#4f46e5',
            color: 'white',
            borderRadius: '0.375rem',
            textDecoration: 'none',
            fontSize: '0.875rem',
          }}
        >
          Invite User
        </Link>
      </div>

      <section style={{ marginBottom: '2rem' }}>
        <h2 style={{ fontSize: '1.25rem', marginBottom: '1rem' }}>Active Users ({users.length})</h2>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ borderBottom: '2px solid #e5e5e5', textAlign: 'left' }}>
              <th style={{ padding: '0.75rem' }}>Name</th>
              <th style={{ padding: '0.75rem' }}>Email</th>
              <th style={{ padding: '0.75rem' }}>Role</th>
              <th style={{ padding: '0.75rem' }}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {users.map((user) => (
              <tr key={user.user_id} style={{ borderBottom: '1px solid #e5e5e5' }}>
                <td style={{ padding: '0.75rem' }}>{user.full_name || '—'}</td>
                <td style={{ padding: '0.75rem' }}>{user.email || '—'}</td>
                <td style={{ padding: '0.75rem' }}>{ROLE_LABELS[user.role]}</td>
                <td style={{ padding: '0.75rem' }}>
                  <Link
                    href={`/users/${user.user_id}`}
                    style={{ color: '#4f46e5', fontSize: '0.875rem' }}
                  >
                    Edit
                  </Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      {invitations.length > 0 && (
        <section>
          <h2 style={{ fontSize: '1.25rem', marginBottom: '1rem' }}>
            Pending Invitations ({invitations.length})
          </h2>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ borderBottom: '2px solid #e5e5e5', textAlign: 'left' }}>
                <th style={{ padding: '0.75rem' }}>Email</th>
                <th style={{ padding: '0.75rem' }}>Role</th>
                <th style={{ padding: '0.75rem' }}>Invited</th>
              </tr>
            </thead>
            <tbody>
              {invitations.map((inv) => (
                <tr key={inv.id} style={{ borderBottom: '1px solid #e5e5e5' }}>
                  <td style={{ padding: '0.75rem' }}>{inv.email}</td>
                  <td style={{ padding: '0.75rem' }}>{ROLE_LABELS[inv.role]}</td>
                  <td style={{ padding: '0.75rem' }}>
                    {new Date(inv.created_at).toLocaleDateString('en-GB')}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}
    </div>
  );
}
