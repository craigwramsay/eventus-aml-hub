/**
 * Matters List Page
 */

import Link from 'next/link';
import { getMatters } from '@/app/actions/matters';
import { getUserProfile } from '@/lib/supabase/server';
import { canDeleteEntities } from '@/lib/auth/roles';
import { MattersList } from './MattersList';
import styles from './matters.module.css';

export default async function MattersPage() {
  const [matters, profile] = await Promise.all([
    getMatters(),
    getUserProfile(),
  ]);

  const canDelete = profile ? canDeleteEntities(profile.role) : false;

  return (
    <>
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
        <MattersList matters={matters} canDelete={canDelete} />
      )}
    </>
  );
}
