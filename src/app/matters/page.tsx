/**
 * Matters List Page
 */

import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getUser } from '@/lib/supabase/server';
import { getMatters } from '@/app/actions/matters';
import { MattersList } from './MattersList';
import styles from './matters.module.css';

export default async function MattersPage() {
  const user = await getUser();

  if (!user) {
    redirect('/login');
  }

  const matters = await getMatters();

  return (
    <div className={styles.container}>
      <Link href="/dashboard" className={styles.backLink}>
        &larr; Back to Dashboard
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
        <MattersList matters={matters} />
      )}
    </div>
  );
}
