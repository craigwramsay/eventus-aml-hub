/**
 * New Client Page
 */

import Link from 'next/link';
import { getUser } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import { NewClientForm } from './NewClientForm';
import styles from '../clients.module.css';

export default async function NewClientPage() {
  const user = await getUser();

  if (!user) {
    redirect('/login');
  }

  return (
    <div className={styles.container}>
      <Link href="/clients" className={styles.backLink}>
        ← Back to Clients
      </Link>

      <h1 className={styles.title}>New Client</h1>

      <NewClientForm />
    </div>
  );
}
