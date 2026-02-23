/**
 * Monitoring Statement
 *
 * Non-interactive statement box with authoritative PCP wording
 * for ongoing monitoring obligations. Shows enhanced monitoring
 * text when HIGH risk or EDD triggered.
 */

import styles from './page.module.css';

interface MonitoringStatementProps {
  isHighRisk: boolean;
  hasEddTriggers: boolean;
}

export function MonitoringStatement({ isHighRisk, hasEddTriggers }: MonitoringStatementProps) {
  const showEnhanced = isHighRisk || hasEddTriggers;

  return (
    <section className={`${styles.section} ${styles.monitoringSection}`}>
      <h2 className={styles.sectionTitle}>Ongoing Monitoring</h2>

      <div className={styles.monitoringStatement}>
        <p className={styles.monitoringText}>
          Eventus Law Limited must conduct ongoing monitoring of all business
          relationships and throughout the lifespan of every matter, including
          scrutiny of transactions undertaken to ensure they are consistent with
          the firm&apos;s knowledge of the client, its business and risk profile.
        </p>
        <p className={styles.monitoringAuthority}>
          LSAG Guidance &sect;6.21; MLR 2017 reg. 28(11)
        </p>
      </div>

      {showEnhanced && (
        <div className={styles.monitoringEnhanced}>
          <p className={styles.monitoringText}>
            <strong>Enhanced monitoring applies.</strong> The frequency and
            intensity of monitoring must be increased commensurate with the
            higher risk profile of this client/matter. This includes more
            frequent reviews of the business relationship and increased
            scrutiny of transactions.
          </p>
          <p className={styles.monitoringAuthority}>
            MLR 2017 reg. 35(3); PCP s.20
          </p>
        </div>
      )}
    </section>
  );
}
