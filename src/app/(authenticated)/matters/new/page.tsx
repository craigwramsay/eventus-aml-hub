/**
 * New Matter Page
 */

import Link from 'next/link';
import { getClients } from '@/app/actions/clients';
import { NewMatterForm } from './NewMatterForm';
import styles from '../matters.module.css';

interface NewMatterPageProps {
  searchParams: Promise<{ client_id?: string }>;
}

export default async function NewMatterPage({ searchParams }: NewMatterPageProps) {
  const clients = await getClients();
  const { client_id } = await searchParams;

  return (
    <>
      <h1 className={styles.title}>New Matter</h1>

      {clients.length === 0 ? (
        <div className={styles.emptyState}>
          <p>You need to create a client first before creating a matter.</p>
          <Link href="/clients/new" className={styles.primaryButton}>
            Create Client
          </Link>
        </div>
      ) : (
        <NewMatterForm clients={clients} preselectedClientId={client_id} />
      )}
    </>
  );
}
