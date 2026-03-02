import Link from 'next/link';
import type { CddExpiryWarning } from '@/app/actions/dashboard';
import styles from '../page.module.css';

interface CddExpiryWarningsProps {
  warnings: CddExpiryWarning[];
}

function riskClass(level: string): string {
  switch (level) {
    case 'HIGH': return styles.riskHigh;
    case 'MEDIUM': return styles.riskMedium;
    default: return styles.riskLow;
  }
}

export function CddExpiryWarnings({ warnings }: CddExpiryWarningsProps) {
  return (
    <section className={styles.cddSection}>
      <h3 className={styles.sectionTitle}>CDD Expiry Warnings</h3>
      {warnings.length === 0 ? (
        <p className={styles.emptyState}>All client verifications are current</p>
      ) : (
        <div className={styles.cddList}>
          {warnings.map((w) => (
            <Link
              key={w.clientId}
              href={`/clients/${w.clientId}`}
              className={`${styles.cddItem} ${
                w.status === 'expired' ? styles.cddItemExpired : styles.cddItemExpiring
              }`}
            >
              <span className={styles.cddClientName}>{w.clientName}</span>
              <span className={`${styles.cddRisk} ${riskClass(w.riskLevel)}`}>
                {w.riskLevel}
              </span>
              {w.longstopBreached ? (
                <span className={styles.cddLongstopBadge}>RE-VERIFY</span>
              ) : (
                <span className={styles.cddDays}>
                  {w.daysRemaining <= 0
                    ? `Expired ${Math.abs(w.daysRemaining)}d ago`
                    : `${w.daysRemaining}d left`}
                </span>
              )}
            </Link>
          ))}
        </div>
      )}
    </section>
  );
}
