/**
 * User Management Page (Admin Only)
 */

import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getUserProfile } from '@/lib/supabase/server';
import { canManageUsers, ROLE_LABELS } from '@/lib/auth/roles';
import { getUsersForFirm, getPendingInvitations } from '@/app/actions/users';
import InvitationsTable from './InvitationsTable';
import styles from './users.module.css';

const ROLE_BADGE: Record<string, string> = {
  solicitor: styles.badgeSolicitor,
  mlro: styles.badgeMlro,
  admin: styles.badgeAdmin,
  platform_admin: styles.badgePlatformAdmin,
};

export default async function UsersPage() {
  const profile = await getUserProfile();

  if (!profile || !canManageUsers(profile.role)) {
    redirect('/dashboard');
  }

  const [users, invitations] = await Promise.all([
    getUsersForFirm(),
    getPendingInvitations(),
  ]);

  return (
    <>
      <div className={styles.header}>
        <h1 className={styles.title}>User Management</h1>
        <Link href="/users/invite" className={styles.primaryButton}>
          Invite User
        </Link>
      </div>

      <section style={{ marginBottom: '2rem' }}>
        <h2 className={styles.sectionTitle}>Active Users ({users.length})</h2>
        <table className={styles.table}>
          <thead>
            <tr>
              <th>Name</th>
              <th>Email</th>
              <th>Role</th>
              <th>Joined</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {users.map((user) => (
              <tr key={user.user_id}>
                <td>{user.full_name || '\u2014'}</td>
                <td>{user.email || '\u2014'}</td>
                <td>
                  <span className={`${styles.badge} ${ROLE_BADGE[user.role] || ''}`}>
                    {ROLE_LABELS[user.role]}
                  </span>
                </td>
                <td>
                  {new Date(user.created_at).toLocaleDateString('en-GB')}
                </td>
                <td>
                  <Link href={`/users/${user.user_id}`} className={styles.tableLink}>
                    Edit
                  </Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <InvitationsTable invitations={invitations} />
    </>
  );
}
