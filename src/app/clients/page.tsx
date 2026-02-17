/**
 * Clients List Page
 */

import Link from 'next/link';
import { getUser } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import { getClients } from '@/app/actions/clients';
import styles from './clients.module.css';

export default async function ClientsPage() {
  const user = await getUser();

  if (!user) {
    redirect('/login');
  }

  const clients = await getClients();

  return (
    <div className={styles.container}>
      <Link href="/dashboard" className={styles.backLink}>
        ← Back to Dashboard
      </Link>

      <div className={styles.header}>
        <h1 className={styles.title}>Clients</h1>
        <Link href="/clients/new" className={styles.primaryButton}>
          New Client
        </Link>
      </div>

      {clients.length === 0 ? (
        <div className={styles.emptyState}>
          <p>No clients yet. Create your first client to get started.</p>
        </div>
      ) : (
        <table className={styles.table}>
          <thead>
            <tr>
              <th>Name</th>
              <th>Type</th>
              <th>Created</th>
            </tr>
          </thead>
          <tbody>
            {clients.map((client) => (
              <tr key={client.id}>
                <td>
                  <Link
                    href={`/clients/${client.id}`}
                    className={styles.tableLink}
                  >
                    {client.name}
                  </Link>
                </td>
                <td>
                  <span
                    className={`${styles.badge} ${
                      client.client_type === 'individual'
                        ? styles.badgeIndividual
                        : styles.badgeCorporate
                    }`}
                  >
                    {client.client_type}
                  </span>
                </td>
                <td>
                  {new Date(client.created_at).toLocaleDateString()}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
