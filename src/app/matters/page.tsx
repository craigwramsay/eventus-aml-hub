/**
 * Matters List Page
 */

import Link from 'next/link';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { getMatters } from '@/app/actions/matters';
import styles from './matters.module.css';

export default async function MattersPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect('/login');
  }

  const matters = await getMatters();

  return (
    <div className={styles.container}>
      <Link href="/dashboard" className={styles.backLink}>
        ← Back to Dashboard
      </Link>

      <div className={styles.header}>
        <h1 className={styles.title}>Matters</h1>
        <Link href="/matters/new" className={styles.primaryButton}>
          New Matter
        </Link>
      </div>

      {matters.length === 0 ? (
        <div className={styles.emptyState}>
          <p>No matters yet. Create your first matter to get started.</p>
        </div>
      ) : (
        <table className={styles.table}>
          <thead>
            <tr>
              <th>Reference</th>
              <th>Client</th>
              <th>Status</th>
              <th>Created</th>
            </tr>
          </thead>
          <tbody>
            {matters.map((matter) => (
              <tr key={matter.id}>
                <td>
                  <Link
                    href={`/matters/${matter.id}`}
                    className={styles.tableLink}
                  >
                    {matter.reference}
                  </Link>
                </td>
                <td>
                  <Link
                    href={`/clients/${matter.client.id}`}
                    className={styles.tableLink}
                  >
                    {matter.client.name}
                  </Link>
                </td>
                <td>
                  <span
                    className={`${styles.badge} ${
                      matter.status === 'open'
                        ? styles.badgeOpen
                        : styles.badgeClosed
                    }`}
                  >
                    {matter.status}
                  </span>
                </td>
                <td>
                  {new Date(matter.created_at).toLocaleDateString()}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
