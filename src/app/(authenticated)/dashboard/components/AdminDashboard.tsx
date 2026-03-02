import Link from 'next/link';
import type { DashboardData, ActivityFeedItem } from '@/app/actions/dashboard';
import { StatCard } from './StatCard';
import { RiskDistribution } from './RiskDistribution';
import { ActivityFeed } from './ActivityFeed';
import styles from '../page.module.css';

interface AdminDashboardProps {
  userName: string;
  data: DashboardData;
  activity: ActivityFeedItem[];
}

export function AdminDashboard({ userName, data, activity }: AdminDashboardProps) {
  return (
    <>
      <header className={styles.header}>
        <h1 className={styles.title}>Dashboard</h1>
        <span className={styles.welcome}>Welcome, {userName}</span>
      </header>

      <div className={styles.statGrid}>
        <StatCard label="Total Clients" value={data.totalClients} href="/clients" />
        <StatCard label="Total Matters" value={data.totalMatters} href="/matters" />
        <StatCard
          label="Total Assessments"
          value={data.totalAssessments}
          href="/assessments"
        />
        <StatCard
          label="Draft Assessments"
          value={data.draftAssessments}
          variant={data.draftAssessments > 0 ? 'warning' : 'default'}
        />
      </div>

      <RiskDistribution
        low={data.assessmentsByRisk.LOW}
        medium={data.assessmentsByRisk.MEDIUM}
        high={data.assessmentsByRisk.HIGH}
      />

      <section className={styles.quickActions}>
        <h3 className={styles.sectionTitle}>Quick Actions</h3>
        <div className={styles.quickActionsRow}>
          <Link href="/users" className={styles.quickActionBtn}>
            Manage Users
          </Link>
          <Link href="/clients" className={styles.quickActionBtn}>
            View Clients
          </Link>
          <Link href="/matters" className={styles.quickActionBtn}>
            View Matters
          </Link>
        </div>
      </section>

      <ActivityFeed items={activity} title="Recent Firm Activity" />
    </>
  );
}
