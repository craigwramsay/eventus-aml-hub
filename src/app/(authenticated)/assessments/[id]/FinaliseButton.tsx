'use client';

/**
 * Finalise Assessment Button
 *
 * Shows "Confirm all CDD completed" with an inline confirmation box
 * instead of window.confirm().
 */

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { finaliseAssessment } from '@/app/actions/assessments';
import styles from './page.module.css';

interface FinaliseButtonProps {
  assessmentId: string;
  cddLongstopBreached?: boolean;
}

export function FinaliseButton({ assessmentId, cddLongstopBreached }: FinaliseButtonProps) {
  const router = useRouter();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleFinalise() {
    if (isSubmitting) return;

    setIsSubmitting(true);
    setError(null);

    try {
      const result = await finaliseAssessment(assessmentId);

      if (result.success) {
        setShowConfirm(false);
        router.refresh();
      } else {
        setError(result.error);
      }
    } catch {
      setError('An unexpected error occurred');
    } finally {
      setIsSubmitting(false);
    }
  }

  if (cddLongstopBreached) {
    return (
      <div className={styles.finaliseContainer}>
        <button
          type="button"
          className={styles.finaliseButton}
          disabled
        >
          Confirm all CDD completed
        </button>
        <p className={styles.finaliseBlockedText}>
          Finalisation is blocked: the 2-year CDD longstop has been exceeded.
          CDD must be re-verified before this assessment can be finalised.
        </p>
      </div>
    );
  }

  return (
    <div className={styles.finaliseContainer}>
      {error && <div className={styles.finaliseError}>{error}</div>}

      {!showConfirm ? (
        <button
          type="button"
          className={styles.finaliseButton}
          onClick={() => setShowConfirm(true)}
        >
          Confirm all CDD completed
        </button>
      ) : (
        <div className={styles.finaliseConfirmBox}>
          <p className={styles.finaliseConfirmText}>
            Are you sure you want to finalise this assessment? Once finalised, it cannot be modified.
          </p>
          <div className={styles.finaliseConfirmActions}>
            <button
              type="button"
              className={styles.finaliseButton}
              onClick={handleFinalise}
              disabled={isSubmitting}
            >
              {isSubmitting ? 'Finalising...' : 'Yes, finalise'}
            </button>
            <button
              type="button"
              className={styles.finaliseCancelButton}
              onClick={() => setShowConfirm(false)}
              disabled={isSubmitting}
            >
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
