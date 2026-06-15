import Link from 'next/link';
import type {
  MatterActionItem,
  MatterActionItemsResult,
} from '@/app/actions/dashboard';
import styles from '../page.module.css';

interface MatterActionItemsProps {
  data: MatterActionItemsResult;
}

function riskClass(level: string | null): string {
  switch (level) {
    case 'HIGH':
      return styles.riskHigh;
    case 'MEDIUM':
      return styles.riskMedium;
    case 'LOW':
      return styles.riskLow;
    default:
      return styles.riskLow;
  }
}

function MatterRow({
  item,
  detail,
}: {
  item: MatterActionItem;
  detail?: React.ReactNode;
}) {
  return (
    <Link key={item.matterId} href={`/matters/${item.matterId}`} className={styles.actionRow}>
      <span className={styles.actionMatter}>{item.matterDescription || item.matterReference}</span>
      <span className={styles.actionClient}>{item.clientName}</span>
      {item.riskLevel && (
        <span className={`${styles.actionRisk} ${riskClass(item.riskLevel)}`}>
          {item.riskLevel}
        </span>
      )}
      {detail && <span className={styles.actionDetail}>{detail}</span>}
    </Link>
  );
}

function Section({
  title,
  emptyMessage,
  items,
  detail,
  tone,
}: {
  title: string;
  emptyMessage: string;
  items: MatterActionItem[];
  detail?: (item: MatterActionItem) => React.ReactNode;
  tone: 'info' | 'warn' | 'error';
}) {
  return (
    <section className={`${styles.actionSection} ${styles[`actionSection_${tone}`]}`}>
      <header className={styles.actionSectionHeader}>
        <h3 className={styles.actionSectionTitle}>
          {title}
          <span className={styles.actionSectionCount}>{items.length}</span>
        </h3>
      </header>
      {items.length === 0 ? (
        <p className={styles.actionEmpty}>{emptyMessage}</p>
      ) : (
        <div className={styles.actionList}>
          {items.map((item) => (
            <MatterRow
              key={item.matterId}
              item={item}
              detail={detail ? detail(item) : undefined}
            />
          ))}
        </div>
      )}
    </section>
  );
}

export function MatterActionItems({ data }: MatterActionItemsProps) {
  const total =
    data.noAssessment.length +
    data.noCdd.length +
    data.cddExpiring.length +
    data.cddExpired.length;

  return (
    <div className={styles.actionContainer}>
      <header className={styles.actionContainerHeader}>
        <h2 className={styles.actionContainerTitle}>Matters needing action</h2>
        <span className={styles.actionContainerCount}>{total} open</span>
      </header>

      <Section
        title="Risk assessment outstanding"
        emptyMessage="All open matters have a finalised risk assessment."
        items={data.noAssessment}
        tone="info"
      />

      <Section
        title="CDD not yet completed"
        emptyMessage="No matters waiting for initial CDD."
        items={data.noCdd}
        tone="warn"
      />

      <Section
        title="CDD expiring soon"
        emptyMessage="No CDD verifications expiring in the next 60 days."
        items={data.cddExpiring}
        detail={(item) => (
          <span>
            {item.daysUntilExpiry === 1
              ? '1 day left'
              : `${item.daysUntilExpiry} days left`}
          </span>
        )}
        tone="warn"
      />

      <Section
        title="CDD expired"
        emptyMessage="No expired CDD verifications."
        items={data.cddExpired}
        detail={(item) => (
          <span>
            Expired {item.daysSinceExpiry === 1 ? '1 day' : `${item.daysSinceExpiry} days`} ago
          </span>
        )}
        tone="error"
      />
    </div>
  );
}
