import Link from 'next/link';
import type { MlroApprovalRequest } from '@/lib/supabase/types';
import styles from '../page.module.css';

type EnrichedApproval = MlroApprovalRequest & {
  client_name: string;
  risk_level: string;
  reference: string;
};

interface PendingApprovalsProps {
  approvals: EnrichedApproval[];
}

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

function riskClass(level: string): string {
  switch (level) {
    case 'HIGH': return styles.riskHigh;
    case 'MEDIUM': return styles.riskMedium;
    default: return styles.riskLow;
  }
}

export function PendingApprovals({ approvals }: PendingApprovalsProps) {
  return (
    <section className={styles.approvalsSection}>
      <h3 className={styles.sectionTitle}>
        Pending Approvals ({approvals.length})
      </h3>
      {approvals.length === 0 ? (
        <p className={styles.emptyState}>No pending approval requests.</p>
      ) : (
        <div className={styles.approvalsList}>
          {approvals.map((a) => (
            <Link
              key={a.id}
              href={`/assessments/${a.assessment_id}`}
              className={styles.approvalItem}
            >
              <span className={styles.approvalClient}>{a.client_name}</span>
              <span className={styles.approvalRef}>{a.reference}</span>
              <span className={`${styles.approvalRisk} ${riskClass(a.risk_level)}`}>
                {a.risk_level}
              </span>
              <span className={styles.approvalDate}>
                {formatDate(a.requested_at)}
              </span>
            </Link>
          ))}
        </div>
      )}
    </section>
  );
}
