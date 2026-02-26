/**
 * Dashboard Page
 */

import Link from 'next/link';
import { createClient } from '@/lib/supabase/server';
import { canManageUsers, canDecideApproval } from '@/lib/auth/roles';
import type { UserRole } from '@/lib/auth/roles';
import { getPendingApprovals } from '@/app/actions/approvals';
import styles from './page.module.css';

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

export default async function DashboardPage() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data: profile } = await supabase
    .from('user_profiles')
    .select('*')
    .eq('user_id', user!.id)
    .single();

  const userRole = profile?.role as UserRole | undefined;
  const showUsersCard = userRole ? canManageUsers(userRole) : false;
  const showApprovals = userRole ? canDecideApproval(userRole) : false;

  // Fetch pending approvals for MLRO users
  const pendingApprovals = showApprovals
    ? await getPendingApprovals()
    : null;
  const approvals = pendingApprovals?.success ? pendingApprovals.approvals : [];

  return (
    <>
      <header className={styles.header}>
        <h1 className={styles.title}>Dashboard</h1>
      </header>

      {!profile && (
        <div className={styles.welcome} style={{ borderColor: '#fde68a', backgroundColor: '#fffbeb' }}>
          <p className={styles.welcomeText} style={{ color: '#92400e' }}>
            Your user profile is not yet configured. Please contact your firm administrator.
          </p>
        </div>
      )}

      {/* Pending Approvals — MLRO only */}
      {showApprovals && (
        <section className={styles.approvalsSection}>
          <h2 className={styles.approvalsSectionTitle}>
            Pending Approvals ({approvals.length})
          </h2>
          {approvals.length === 0 ? (
            <p className={styles.approvalsEmpty}>No pending approval requests.</p>
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
      )}

      <nav className={styles.nav}>
        <Link href="/clients" className={styles.navCard}>
          <h2 className={styles.navCardTitle}>Clients</h2>
          <p className={styles.navCardDescription}>
            Manage clients and view their details
          </p>
        </Link>

        <Link href="/matters" className={styles.navCard}>
          <h2 className={styles.navCardTitle}>Matters</h2>
          <p className={styles.navCardDescription}>
            Manage matters and conduct assessments
          </p>
        </Link>

        <Link href="/assessments" className={styles.navCard}>
          <h2 className={styles.navCardTitle}>Assessments</h2>
          <p className={styles.navCardDescription}>
            View completed risk assessments
          </p>
        </Link>

        {showUsersCard && (
          <Link href="/users" className={styles.navCard}>
            <h2 className={styles.navCardTitle}>User Management</h2>
            <p className={styles.navCardDescription}>
              Invite users, assign roles, and manage access
            </p>
          </Link>
        )}
      </nav>
    </>
  );
}
