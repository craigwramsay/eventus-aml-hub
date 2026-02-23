/**
 * Assessments List Page
 *
 * Shows all risk assessments for the user's firm with filters.
 */

import { getAllAssessments } from '@/app/actions/assessments';
import { getUserProfile } from '@/lib/supabase/server';
import { canDeleteEntities } from '@/lib/auth/roles';
import { AssessmentsList } from './AssessmentsList';
import styles from './assessments.module.css';

export default async function AssessmentsPage() {
  const [assessments, profile] = await Promise.all([
    getAllAssessments(),
    getUserProfile(),
  ]);

  const canDelete = profile ? canDeleteEntities(profile.role) : false;

  return (
    <>
      <div className={styles.header}>
        <h1 className={styles.title}>Risk Assessments</h1>
      </div>

      {assessments.length === 0 ? (
        <div className={styles.emptyState}>
          <p>No assessments yet. Create one from a matter page.</p>
        </div>
      ) : (
        <AssessmentsList assessments={assessments} canDelete={canDelete} />
      )}
    </>
  );
}
