import { getCddStalenessConfig } from '@/lib/rules-engine/config-loader';
import styles from '../matters.module.css';

interface CddLongstopBannerProps {
  lastCddVerifiedAt: string | null | undefined;
}

function monthsBetween(dateStr: string, now: Date): number {
  const date = new Date(dateStr);
  return (now.getFullYear() - date.getFullYear()) * 12 +
    (now.getMonth() - date.getMonth());
}

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
}

export function CddLongstopBanner({ lastCddVerifiedAt }: CddLongstopBannerProps) {
  const config = getCddStalenessConfig();
  const longstopMonths = config.universalLongstopMonths ?? 24;

  if (!lastCddVerifiedAt) {
    return (
      <div className={`${styles.staleBanner} ${styles.staleBannerAmber}`}>
        <div className={styles.staleBannerText}>
          No CDD verification has been recorded for this client. CDD must be verified before
          an assessment can be finalised.
        </div>
      </div>
    );
  }

  const now = new Date();
  const months = monthsBetween(lastCddVerifiedAt, now);

  const longstopDate = new Date(lastCddVerifiedAt);
  longstopDate.setMonth(longstopDate.getMonth() + longstopMonths);
  const daysUntilLongstop = Math.ceil(
    (longstopDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)
  );

  const breached = daysUntilLongstop <= 0;
  const approaching = !breached && daysUntilLongstop <= 60;

  if (!breached && !approaching) return null;

  if (breached) {
    return (
      <div className={`${styles.staleBanner} ${styles.staleBannerRed}`}>
        <div className={styles.staleBannerText}>
          <strong>CDD re-verification required.</strong> Last verified {formatDate(lastCddVerifiedAt)} ({months} months ago).
          CDD must be re-verified at least every {longstopMonths / 12} years.
          Assessment finalisation is blocked until CDD is updated.
        </div>
      </div>
    );
  }

  return (
    <div className={`${styles.staleBanner} ${styles.staleBannerAmber}`}>
      <div className={styles.staleBannerText}>
        CDD verification is due for renewal. Last verified {formatDate(lastCddVerifiedAt)} ({months} months ago).
        Re-verification is required within {daysUntilLongstop} days.
      </div>
    </div>
  );
}
