'use client';

/**
 * DeleteUserButton — small per-row client component for the Active Users
 * table. Confirms the destructive action with the admin, calls the
 * deleteFirmUser server action, and refreshes the page on success.
 *
 * Cannot delete the current user; that's also enforced server-side.
 */

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { deleteFirmUser } from '@/app/actions/users';
import styles from './users.module.css';

interface DeleteUserButtonProps {
  userId: string;
  email: string | null;
  fullName: string | null;
  /** True when this row represents the currently logged-in user */
  isSelf: boolean;
}

export default function DeleteUserButton({
  userId,
  email,
  fullName,
  isSelf,
}: DeleteUserButtonProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  if (isSelf) {
    return <span className={styles.selfRowMarker}>(you)</span>;
  }

  const handleClick = () => {
    const label = fullName || email || 'this user';
    const confirmed = window.confirm(
      `Permanently delete ${label}?\n\n` +
      'They will be removed from the firm, lose access to the Hub, and ' +
      'their account in Supabase Auth will be deleted. Historical records ' +
      '(assessments, evidence, audit events) created by this user will be ' +
      'preserved for compliance purposes but will no longer link to a ' +
      'live profile.\n\nThis cannot be undone.'
    );
    if (!confirmed) return;

    setError(null);
    startTransition(async () => {
      const result = await deleteFirmUser(userId);
      if (!result.success) {
        setError(result.error);
        return;
      }
      router.refresh();
    });
  };

  return (
    <>
      <button
        type="button"
        onClick={handleClick}
        disabled={isPending}
        className={styles.smallDangerButton}
      >
        {isPending ? 'Deleting...' : 'Delete'}
      </button>
      {error && <p className={styles.actionsError}>{error}</p>}
    </>
  );
}
