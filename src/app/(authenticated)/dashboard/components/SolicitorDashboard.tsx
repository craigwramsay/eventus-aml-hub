import Link from 'next/link';
import type { DashboardData, ActivityFeedItem, AssessmentStaleWarning } from '@/app/actions/dashboard';
import { StatCard } from './StatCard';
import { RiskDistribution } from './RiskDistribution';
import { ActivityFeed } from './ActivityFeed';
import { AssessmentStaleWarnings } from './AssessmentStaleWarnings';
import styles from '../page.module.css';

interface SolicitorDashboardProps {
  userName: string;
  data: DashboardData;
  activity: ActivityFeedItem[];
  assessmentStaleWarnings: AssessmentStaleWarning[];
}

export function SolicitorDashboard({ userName, data, activity, assessmentStaleWarnings }: SolicitorDashboardProps) {
  return (
    <>
      <header className={styles.header}>
        <h1 className={styles.title}>Dashboard</h1>
        <span className={styles.welcome}>Welcome, {userName}</span>
      </header>

      <div className={styles.statGrid}>
        <StatCard
          label="My Assessments"
          value={data.totalAssessments}
          href="/assessments"
        />
        <StatCard
          label="Draft Assessments"
          value={data.draftAssessments}
          variant={data.draftAssessments > 0 ? 'warning' : 'default'}
        />
        <StatCard label="My Clients" value={data.totalClients} href="/clients" />
        <StatCard label="My Matters" value={data.totalMatters} href="/matters" />
      </div>

      <RiskDistribution
        low={data.assessmentsByRisk.LOW}
        medium={data.assessmentsByRisk.MEDIUM}
        high={data.assessmentsByRisk.HIGH}
      />

      <section className={styles.quickActions}>
        <h3 className={styles.sectionTitle}>Quick Actions</h3>
        <div className={styles.quickActionsRow}>
          <Link href="/assessments/new" className={styles.quickActionBtn}>
            New Assessment
          </Link>
          <Link href="/clients" className={styles.quickActionBtn}>
            View Clients
          </Link>
          <Link href="/matters" className={styles.quickActionBtn}>
            View Matters
          </Link>
        </div>
      </section>

      <AssessmentStaleWarnings warnings={assessmentStaleWarnings} />

      <ActivityFeed items={activity} title="My Recent Activity" />
    </>
  );
}
