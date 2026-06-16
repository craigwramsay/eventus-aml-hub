import type {
  DashboardData,
  ActivityFeedItem,
  AssessmentStaleWarning,
  MatterActionItemsResult,
} from '@/app/actions/dashboard';
import type { MlroApprovalRequest } from '@/lib/supabase/types';
import { StatCard } from './StatCard';
import { RiskDistribution } from './RiskDistribution';
import { ActivityFeed } from './ActivityFeed';
import { PendingApprovals } from './PendingApprovals';
import { MatterActionItems } from './MatterActionItems';
import { AssessmentStaleWarnings } from './AssessmentStaleWarnings';
import styles from '../page.module.css';

type EnrichedApproval = MlroApprovalRequest & {
  client_name: string;
  risk_level: string;
  reference: string;
};

interface MlroDashboardProps {
  userName: string;
  data: DashboardData;
  activity: ActivityFeedItem[];
  approvals: EnrichedApproval[];
  matterActions: MatterActionItemsResult;
  assessmentStaleWarnings: AssessmentStaleWarning[];
}

export function MlroDashboard({
  userName,
  data,
  activity,
  approvals,
  matterActions,
  assessmentStaleWarnings,
}: MlroDashboardProps) {
  return (
    <>
      <header className={styles.header}>
        <h1 className={styles.title}>Dashboard</h1>
        <span className={styles.welcome}>Welcome, {userName}</span>
      </header>

      <div className={styles.statGrid}>
        <StatCard
          label="Total Assessments"
          value={data.totalAssessments}
          href="/assessments"
        />
        <StatCard
          label="Pending Approvals"
          value={data.pendingApprovals}
          variant={data.pendingApprovals > 0 ? 'danger' : 'default'}
        />
        <StatCard
          label="CDD Completion"
          value={`${data.cddCompletionRate}%`}
        />
        <StatCard label="Total Clients" value={data.totalClients} href="/clients" />
      </div>

      <RiskDistribution
        low={data.assessmentsByRisk.LOW}
        medium={data.assessmentsByRisk.MEDIUM}
        high={data.assessmentsByRisk.HIGH}
      />

      <PendingApprovals approvals={approvals} />

      <MatterActionItems data={matterActions} />

      <AssessmentStaleWarnings warnings={assessmentStaleWarnings} />

      <ActivityFeed items={activity} title="Recent Firm Activity" />
    </>
  );
}
