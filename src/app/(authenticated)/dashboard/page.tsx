/**
 * Dashboard Page — Role-Differentiated
 *
 * Fetches data server-side and delegates to role-specific layout components.
 * Solicitors see their own work; MLROs/admins see firm-wide data.
 */

import { createClient } from '@/lib/supabase/server';
import { canDecideApproval } from '@/lib/auth/roles';
import type { UserRole } from '@/lib/auth/roles';
import { getPendingApprovals } from '@/app/actions/approvals';
import { getDashboardData, getActivityFeed, getCddExpiryWarnings, getAssessmentStaleWarnings } from '@/app/actions/dashboard';
import { SolicitorDashboard } from './components/SolicitorDashboard';
import { MlroDashboard } from './components/MlroDashboard';
import { AdminDashboard } from './components/AdminDashboard';
import styles from './page.module.css';

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

  if (!profile) {
    return (
      <>
        <header className={styles.header}>
          <h1 className={styles.title}>Dashboard</h1>
        </header>
        <div className={styles.profileWarning}>
          <p className={styles.profileWarningText}>
            Your user profile is not yet configured. Please contact your firm administrator.
          </p>
        </div>
      </>
    );
  }

  const role = profile.role as UserRole;
  const userName = profile.full_name || profile.email || 'User';
  const userId = user!.id;
  const firmId = profile.firm_id;

  // Fetch data in parallel
  const [data, activity] = await Promise.all([
    getDashboardData(userId, firmId, role),
    getActivityFeed(firmId, role, userId),
  ]);

  // Solicitor layout
  if (role === 'solicitor') {
    const staleWarnings = await getAssessmentStaleWarnings(firmId, userId);
    return (
      <SolicitorDashboard
        userName={userName}
        data={data}
        activity={activity}
        assessmentStaleWarnings={staleWarnings}
      />
    );
  }

  // MLRO / platform_admin layout
  if (role === 'mlro' || role === 'platform_admin') {
    const [pendingResult, cddWarnings, staleWarnings] = await Promise.all([
      getPendingApprovals(),
      getCddExpiryWarnings(firmId),
      getAssessmentStaleWarnings(firmId),
    ]);
    const approvals = pendingResult.success ? pendingResult.approvals : [];

    return (
      <MlroDashboard
        userName={userName}
        data={data}
        activity={activity}
        approvals={approvals}
        cddWarnings={cddWarnings}
        assessmentStaleWarnings={staleWarnings}
      />
    );
  }

  // Admin layout
  return (
    <AdminDashboard
      userName={userName}
      data={data}
      activity={activity}
    />
  );
}
