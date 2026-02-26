import { getCddStalenessConfig } from '@/lib/rules-engine/config-loader';
import type { RiskLevel } from '@/lib/supabase/types';
import styles from './page.module.css';

interface CDDStatusBannerProps {
  lastCddVerifiedAt: string | null | undefined;
  riskLevel: RiskLevel;
}

function monthsAgo(dateStr: string): number {
  const date = new Date(dateStr + 'T00:00:00');
  const now = new Date();
  return (
    (now.getFullYear() - date.getFullYear()) * 12 +
    (now.getMonth() - date.getMonth())
  );
}

function formatCddDate(dateStr: string): string {
  return new Date(dateStr + 'T00:00:00').toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
}

export function CDDStatusBanner({ lastCddVerifiedAt, riskLevel }: CDDStatusBannerProps) {
  const config = getCddStalenessConfig();
  const threshold = config.thresholds[riskLevel];

  if (!lastCddVerifiedAt) {
    return (
      <div className={`${styles.cddStatusBanner} ${styles.cddStatusNone}`}>
        No previous CDD verification recorded for this client.
      </div>
    );
  }

  const months = monthsAgo(lastCddVerifiedAt);
  const isStale = threshold && months >= threshold.months;

  if (isStale) {
    return (
      <div className={`${styles.cddStatusBanner} ${styles.cddStatusStale}`}>
        <strong>CDD Review Recommended:</strong> CDD was last verified on{' '}
        {formatCddDate(lastCddVerifiedAt)} ({months} months ago). For{' '}
        {riskLevel} risk, CDD should be reviewed after {threshold.label}.
        <div className={styles.cddStatusAuthority}>
          LSAG 2025 §6.21 — CDD should be reviewed on each new matter; a gap of 1+ year is significant for higher-risk clients.
        </div>
      </div>
    );
  }

  return (
    <div className={`${styles.cddStatusBanner} ${styles.cddStatusRecent}`}>
      CDD last verified on {formatCddDate(lastCddVerifiedAt)} ({months} months ago).
    </div>
  );
}
