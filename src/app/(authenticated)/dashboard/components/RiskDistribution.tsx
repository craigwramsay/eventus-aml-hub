import styles from '../page.module.css';

interface RiskDistributionProps {
  low: number;
  medium: number;
  high: number;
}

export function RiskDistribution({ low, medium, high }: RiskDistributionProps) {
  const total = low + medium + high;

  if (total === 0) {
    return (
      <div className={styles.riskDistribution}>
        <h3 className={styles.sectionTitle}>Risk Distribution</h3>
        <p className={styles.emptyState}>No assessments yet</p>
      </div>
    );
  }

  const lowPct = (low / total) * 100;
  const medPct = (medium / total) * 100;
  const highPct = (high / total) * 100;

  return (
    <div className={styles.riskDistribution}>
      <h3 className={styles.sectionTitle}>Risk Distribution</h3>
      <div className={styles.riskBar}>
        {low > 0 && (
          <div
            className={`${styles.riskSegment} ${styles.riskSegmentLow}`}
            style={{ width: `${lowPct}%` }}
            title={`LOW: ${low}`}
          >
            {low}
          </div>
        )}
        {medium > 0 && (
          <div
            className={`${styles.riskSegment} ${styles.riskSegmentMedium}`}
            style={{ width: `${medPct}%` }}
            title={`MEDIUM: ${medium}`}
          >
            {medium}
          </div>
        )}
        {high > 0 && (
          <div
            className={`${styles.riskSegment} ${styles.riskSegmentHigh}`}
            style={{ width: `${highPct}%` }}
            title={`HIGH: ${high}`}
          >
            {high}
          </div>
        )}
      </div>
      <div className={styles.riskLegend}>
        <span className={styles.riskLegendItem}>
          <span className={`${styles.riskDot} ${styles.riskDotLow}`} /> LOW ({low})
        </span>
        <span className={styles.riskLegendItem}>
          <span className={`${styles.riskDot} ${styles.riskDotMedium}`} /> MEDIUM ({medium})
        </span>
        <span className={styles.riskLegendItem}>
          <span className={`${styles.riskDot} ${styles.riskDotHigh}`} /> HIGH ({high})
        </span>
      </div>
    </div>
  );
}
