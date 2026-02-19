/**
 * Dashboard Page
 */

import Link from 'next/link';
import { createClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import { LogoutButton } from './LogoutButton';
import { canManageUsers, ROLE_LABELS } from '@/lib/auth/roles';
import type { UserRole } from '@/lib/auth/roles';
import styles from './page.module.css';

export default async function DashboardPage() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect('/login');
  }

  // Fetch profile using same client instance
  const { data: profile } = await supabase
    .from('user_profiles')
    .select('*')
    .eq('user_id', user.id)
    .single();

  const userRole = profile?.role as UserRole | undefined;
  const showUsersCard = userRole ? canManageUsers(userRole) : false;
  const displayEmail = user.email ?? '';
  const displayRole = userRole ? ROLE_LABELS[userRole] : null;

  return (
    <div className={styles.container}>
      <header className={styles.header}>
        <h1 className={styles.title}>Dashboard</h1>
        <div className={styles.userInfo}>
          <span className={styles.email}>{displayEmail}</span>
          {displayRole && <span className={styles.role}>{displayRole}</span>}
          <LogoutButton />
        </div>
      </header>

      {!profile && (
        <div className={styles.welcome} style={{ borderColor: '#fde68a', backgroundColor: '#fffbeb' }}>
          <p className={styles.welcomeText} style={{ color: '#92400e' }}>
            Your user profile is not yet configured. Please contact your firm administrator.
          </p>
        </div>
      )}

      {profile && (
        <div className={styles.welcome}>
          <p className={styles.welcomeText}>
            Welcome to AML Hub. You are signed in as {displayEmail}.
          </p>
        </div>
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
    </div>
  );
}
