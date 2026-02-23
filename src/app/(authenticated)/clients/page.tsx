/**
 * Clients List Page
 */

import Link from 'next/link';
import { getClients } from '@/app/actions/clients';
import { ClientsList } from './ClientsList';
import styles from './clients.module.css';

export default async function ClientsPage() {
  const clients = await getClients();

  return (
    <>
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
        <ClientsList clients={clients} />
      )}
    </>
  );
}
