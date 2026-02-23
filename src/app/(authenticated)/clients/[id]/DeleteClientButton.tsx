'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { deleteClient } from '@/app/actions/clients';
import styles from '../clients.module.css';

interface DeleteClientButtonProps {
  clientId: string;
  clientName: string;
  matterCount: number;
  assessmentCount: number;
}

export function DeleteClientButton({ clientId, clientName, matterCount, assessmentCount }: DeleteClientButtonProps) {
  const router = useRouter();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleDelete() {
    if (isSubmitting) return;

    setIsSubmitting(true);
    setError(null);

    try {
      const result = await deleteClient(clientId);

      if (result.success) {
        router.push('/clients');
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
          Delete Client
        </button>
      ) : (
        <div className={styles.deleteConfirmBox}>
          <p className={styles.deleteConfirmText}>
            This will permanently delete <strong>{clientName}</strong> and all associated data,
            including <strong>{matterCount} matter{matterCount !== 1 ? 's' : ''}</strong> and{' '}
            <strong>{assessmentCount} assessment{assessmentCount !== 1 ? 's' : ''}</strong>.
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
