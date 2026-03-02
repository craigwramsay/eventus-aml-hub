import Link from 'next/link';
import { getAssessmentStalenessConfig } from '@/lib/rules-engine/config-loader';
import styles from '../matters.module.css';

interface AssessmentStaleBannerProps {
  latestFinalisedAt: string | null;
  riskLevel: string | null;
  matterId: string;
}

function monthsBetween(dateStr: string, now: Date): number {
  const date = new Date(dateStr);
  return (now.getFullYear() - date.getFullYear()) * 12 +
    (now.getMonth() - date.getMonth());
}

export function AssessmentStaleBanner({
  latestFinalisedAt,
  riskLevel,
  matterId,
}: AssessmentStaleBannerProps) {
  if (!latestFinalisedAt || !riskLevel) return null;

  const config = getAssessmentStalenessConfig();
  const threshold = config.thresholds[riskLevel];
  if (!threshold) return null;

  const now = new Date();
  const monthsElapsed = monthsBetween(latestFinalisedAt, now);

  const staleAt = new Date(latestFinalisedAt);
  staleAt.setMonth(staleAt.getMonth() + threshold.months);
  const daysUntilStale = Math.ceil(
    (staleAt.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)
  );

  const isStale = daysUntilStale <= 0;
  const isApproaching = !isStale && daysUntilStale <= 60;

  if (!isStale && !isApproaching) return null;

  return (
    <div className={`${styles.staleBanner} ${isStale ? styles.staleBannerRed : styles.staleBannerAmber}`}>
      <div className={styles.staleBannerText}>
        The risk assessment for this client was last completed {monthsElapsed} months ago.
        For {riskLevel} risk clients, assessments should be reviewed every {threshold.label}.
      </div>
      <Link
        href={`/assessments/new?matter_id=${matterId}`}
        className={styles.staleBannerLink}
      >
        Re-run Assessment
      </Link>
    </div>
  );
}
