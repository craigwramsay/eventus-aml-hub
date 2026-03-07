'use client';

/**
 * Clio Drive Sync Badge
 *
 * Shows the sync status of an evidence item or finalisation HTML to Clio Drive.
 * Displays: syncing spinner, green "View in Clio" link, or red "Failed" with retry.
 */

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import type { ClioDriveSync } from '@/lib/supabase/types';
import { retryClioDriveSync } from '@/app/actions/clio-drive';
import styles from './page.module.css';

interface ClioDriveSyncBadgeProps {
  /** Evidence ID to find the matching sync record (null for finalisation HTML) */
  evidenceId?: string | null;
  /** Sync type to match (defaults to 'evidence') */
  syncType?: 'evidence' | 'finalisation_html';
  /** All sync records for this assessment */
  syncRecords: ClioDriveSync[];
}

export function ClioDriveSyncBadge({
  evidenceId,
  syncType = 'evidence',
  syncRecords,
}: ClioDriveSyncBadgeProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [retryError, setRetryError] = useState<string | null>(null);

  // Find the matching sync record
  const record = syncRecords.find((r) => {
    if (syncType === 'finalisation_html') {
      return r.sync_type === 'finalisation_html';
    }
    return r.sync_type === 'evidence' && r.evidence_id === evidenceId;
  });

  if (!record) return null;

  function handleRetry() {
    if (!record) return;
    setRetryError(null);

    startTransition(async () => {
      const result = await retryClioDriveSync(record.id);
      if (!result.success) {
        setRetryError(result.error || 'Retry failed');
      } else {
        router.refresh();
      }
    });
  }

  if (record.status === 'pending' || record.status === 'uploading') {
    return (
      <span className={`${styles.clioSyncBadge} ${styles.clioSyncPending}`}>
        <span className={styles.clioSyncSpinner} />
        Syncing to Clio...
      </span>
    );
  }

  if (record.status === 'synced' && record.clio_document_url) {
    return (
      <a
        href={record.clio_document_url}
        target="_blank"
        rel="noopener noreferrer"
        className={`${styles.clioSyncBadge} ${styles.clioSyncSynced}`}
      >
        View in Clio
      </a>
    );
  }

  if (record.status === 'failed') {
    return (
      <span className={`${styles.clioSyncBadge} ${styles.clioSyncFailed}`}>
        Clio sync failed
        <button
          type="button"
          className={styles.clioRetryButton}
          onClick={handleRetry}
          disabled={isPending}
        >
          {isPending ? 'Retrying...' : 'Retry'}
        </button>
        {retryError && (
          <span className={styles.clioRetryError}>{retryError}</span>
        )}
      </span>
    );
  }

  return null;
}
