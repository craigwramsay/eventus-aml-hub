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
import { retryClioDriveSync, resyncClioEvidence } from '@/app/actions/clio-drive';
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

  // Find the most recent matching sync record (records are sorted ascending by created_at,
  // so findLast gives us the newest — important when retries create additional records)
  const record = syncRecords.findLast((r) => {
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

  function handleResync() {
    if (!record) return;
    if (typeof window !== 'undefined') {
      const ok = window.confirm(
        'Resync to Clio? The current file in Clio Drive will be replaced with the latest version.'
      );
      if (!ok) return;
    }
    setRetryError(null);
    startTransition(async () => {
      const result = await resyncClioEvidence(record.id);
      if (!result.success) {
        setRetryError(result.error || 'Resync failed');
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
    // Only show Resync for evidence syncs (not the finalisation HTML, which
    // doesn't have a force-resync path).
    const canResync = syncType === 'evidence';
    return (
      <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
        <a
          href={record.clio_document_url}
          target="_blank"
          rel="noopener noreferrer"
          className={`${styles.clioSyncBadge} ${styles.clioSyncSynced}`}
        >
          View in Clio
        </a>
        {canResync && (
          <button
            type="button"
            className={styles.clioRetryButton}
            onClick={handleResync}
            disabled={isPending}
            title="Replace the file in Clio Drive with the latest version"
          >
            {isPending ? 'Resyncing…' : 'Resync'}
          </button>
        )}
        {retryError && (
          <span className={styles.clioRetryError}>{retryError}</span>
        )}
      </span>
    );
  }

  if (record.status === 'failed') {
    return (
      <span className={`${styles.clioSyncBadge} ${styles.clioSyncFailed}`}>
        Clio sync failed
        {record.error_message && (
          <span className={styles.clioRetryError} title={record.error_message}>
            {record.error_message.length > 80
              ? record.error_message.substring(0, 80) + '…'
              : record.error_message}
          </span>
        )}
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
