import Link from 'next/link';
import type { AssessmentStaleWarning } from '@/app/actions/dashboard';
import styles from '../page.module.css';

interface AssessmentStaleWarningsProps {
  warnings: AssessmentStaleWarning[];
}

function riskClass(level: string): string {
  switch (level) {
    case 'HIGH': return styles.riskHigh;
    case 'MEDIUM': return styles.riskMedium;
    default: return styles.riskLow;
  }
}

export function AssessmentStaleWarnings({ warnings }: AssessmentStaleWarningsProps) {
  return (
    <section className={styles.staleSection}>
      <h3 className={styles.sectionTitle}>Assessment Staleness Warnings</h3>
      {warnings.length === 0 ? (
        <p className={styles.emptyState}>All client assessments are current</p>
      ) : (
        <div className={styles.staleList}>
          {warnings.map((w) => (
            <Link
              key={w.clientId}
              href={`/assessments/new?matter_id=${w.matterId}`}
              className={`${styles.staleItem} ${
                w.status === 'stale' ? styles.staleItemOverdue : styles.staleItemApproaching
              }`}
            >
              <span className={styles.staleClientName}>{w.clientName}</span>
              <span className={styles.staleMatter}>{w.matterReference}</span>
              <span className={`${styles.staleRisk} ${riskClass(w.riskLevel)}`}>
                {w.riskLevel}
              </span>
              <span className={styles.staleAge}>
                {w.status === 'stale'
                  ? `${w.monthsElapsed}mo (due at ${w.thresholdMonths}mo)`
                  : `Due in ${w.thresholdMonths - w.monthsElapsed}mo`}
              </span>
            </Link>
          ))}
        </div>
      )}
    </section>
  );
}
