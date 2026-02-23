'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { deleteAssessment } from '@/app/actions/assessments';
import styles from './page.module.css';

interface DeleteAssessmentButtonProps {
  assessmentId: string;
  isFinalised: boolean;
}

export function DeleteAssessmentButton({ assessmentId, isFinalised }: DeleteAssessmentButtonProps) {
  const router = useRouter();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleDelete() {
    if (isSubmitting) return;

    setIsSubmitting(true);
    setError(null);

    try {
      const result = await deleteAssessment(assessmentId);

      if (result.success) {
        router.push('/assessments');
      } else {
        setError(result.error);
      }
    } catch {
      setError('An unexpected error occurred');
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <>
      {error && <div className={styles.deleteError}>{error}</div>}

      {!showConfirm ? (
        <button
          type="button"
          className={styles.dangerButton}
          onClick={() => setShowConfirm(true)}
        >
          Delete Assessment
        </button>
      ) : (
        <div className={styles.deleteConfirmBox}>
          <p className={styles.deleteConfirmText}>
            {isFinalised
              ? 'This assessment has been finalised. Deleting it will permanently remove it along with all evidence and progress. This cannot be undone.'
              : 'This will permanently delete this assessment along with all evidence and progress. This cannot be undone.'}
          </p>
          <div className={styles.deleteConfirmActions}>
            <button
              type="button"
              className={styles.dangerButton}
              onClick={handleDelete}
              disabled={isSubmitting}
            >
              {isSubmitting ? 'Deleting...' : 'Yes, delete'}
            </button>
            <button
              type="button"
              className={styles.deleteCancelButton}
              onClick={() => setShowConfirm(false)}
              disabled={isSubmitting}
            >
              Cancel
            </button>
          </div>
        </div>
      )}
    </>
  );
}
