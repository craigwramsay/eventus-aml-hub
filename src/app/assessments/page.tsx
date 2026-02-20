/**
 * Assessments List Page
 *
 * Shows all risk assessments for the user's firm with filters.
 */

import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getUser } from '@/lib/supabase/server';
import { getAllAssessments } from '@/app/actions/assessments';
import { AssessmentsList } from './AssessmentsList';
import styles from './assessments.module.css';

export default async function AssessmentsPage() {
  const user = await getUser();

  if (!user) {
    redirect('/login');
  }

  const assessments = await getAllAssessments();

  return (
    <div className={styles.container}>
      <Link href="/dashboard" className={styles.backLink}>
        &larr; Back to Dashboard
      </Link>

      <div className={styles.header}>
        <h1 className={styles.title}>Risk Assessments</h1>
      </div>

      {assessments.length === 0 ? (
        <div className={styles.emptyState}>
          <p>No assessments yet. Create one from a matter page.</p>
        </div>
      ) : (
        <AssessmentsList assessments={assessments} />
      )}
    </div>
  );
}
