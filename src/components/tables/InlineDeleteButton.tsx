'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import styles from './inlineDeleteButton.module.css';

interface InlineDeleteButtonProps {
  label: string;
  confirmMessage: string;
  onDelete: () => Promise<{ success: boolean; error?: string }>;
}

export function InlineDeleteButton({ label, confirmMessage, onDelete }: InlineDeleteButtonProps) {
  const router = useRouter();
  const [showConfirm, setShowConfirm] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleDelete() {
    if (isDeleting) return;
    setIsDeleting(true);
    setError(null);

    try {
      const result = await onDelete();
      if (result.success) {
        router.refresh();
      } else {
        setError(result.error || 'Delete failed');
        setShowConfirm(false);
      }
    } catch {
      setError('An unexpected error occurred');
      setShowConfirm(false);
    } finally {
      setIsDeleting(false);
    }
  }

  if (error) {
    return (
      <span className={styles.error} title={error}>
        Error
      </span>
    );
  }

  if (!showConfirm) {
    return (
      <button
        type="button"
        className={styles.deleteButton}
        onClick={() => setShowConfirm(true)}
      >
        {label}
      </button>
    );
  }

  return (
    <span className={styles.confirmRow}>
      <span className={styles.confirmText}>{confirmMessage}</span>
      <button
        type="button"
        className={styles.confirmYes}
        onClick={handleDelete}
        disabled={isDeleting}
      >
        {isDeleting ? '...' : 'Yes'}
      </button>
      <button
        type="button"
        className={styles.confirmCancel}
        onClick={() => setShowConfirm(false)}
        disabled={isDeleting}
      >
        Cancel
      </button>
    </span>
  );
}
