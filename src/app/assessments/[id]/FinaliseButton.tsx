'use client';

/**
 * Finalise Assessment Button
 * Calls the finaliseAssessment server action and handles the result
 */

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { finaliseAssessment } from '@/app/actions/assessment';
import styles from './page.module.css';

interface FinaliseButtonProps {
  assessmentId: string;
}

export function FinaliseButton({ assessmentId }: FinaliseButtonProps) {
  const router = useRouter();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleFinalise() {
    if (isSubmitting) return;

    const confirmed = window.confirm(
      'Are you sure you want to finalise this assessment?\n\nOnce finalised, it cannot be modified.'
    );

    if (!confirmed) return;

    setIsSubmitting(true);
    setError(null);

    try {
      const result = await finaliseAssessment(assessmentId);

      if (result.success) {
        // Refresh the page to show updated state
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

  return (
    <div className={styles.finaliseContainer}>
      {error && <div className={styles.finaliseError}>{error}</div>}
      <button
        type="button"
        className={styles.finaliseButton}
        onClick={handleFinalise}
        disabled={isSubmitting}
      >
        {isSubmitting ? 'Finalising...' : 'Finalise Assessment'}
      </button>
    </div>
  );
}
