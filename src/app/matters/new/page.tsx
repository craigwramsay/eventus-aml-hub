/**
 * New Matter Page
 */

import Link from 'next/link';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { getClients } from '@/app/actions/clients';
import { NewMatterForm } from './NewMatterForm';
import styles from '../matters.module.css';

interface NewMatterPageProps {
  searchParams: Promise<{ client_id?: string }>;
}

export default async function NewMatterPage({ searchParams }: NewMatterPageProps) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect('/login');
  }

  const clients = await getClients();
  const { client_id } = await searchParams;

  return (
    <div className={styles.container}>
      <Link href="/matters" className={styles.backLink}>
        ← Back to Matters
      </Link>

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
    </div>
  );
}
