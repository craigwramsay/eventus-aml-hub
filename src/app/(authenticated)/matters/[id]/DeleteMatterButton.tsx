'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { deleteMatter } from '@/app/actions/matters';
import styles from '../matters.module.css';

interface DeleteMatterButtonProps {
  matterId: string;
  matterReference: string;
  assessmentCount: number;
}

export function DeleteMatterButton({ matterId, matterReference, assessmentCount }: DeleteMatterButtonProps) {
  const router = useRouter();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleDelete() {
    if (isSubmitting) return;

    setIsSubmitting(true);
    setError(null);

    try {
      const result = await deleteMatter(matterId);

      if (result.success) {
        router.push('/matters');
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
          Delete Matter
        </button>
      ) : (
        <div className={styles.deleteConfirmBox}>
          <p className={styles.deleteConfirmText}>
            This will permanently delete matter <strong>{matterReference}</strong> and{' '}
            <strong>{assessmentCount} associated assessment{assessmentCount !== 1 ? 's' : ''}</strong>.
            This cannot be undone.
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
