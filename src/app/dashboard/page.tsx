/**
 * Dashboard Page
 */

import Link from 'next/link';
import { getUser } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import { LogoutButton } from './LogoutButton';
import styles from './page.module.css';

export default async function DashboardPage() {
  const user = await getUser();

  if (!user) {
    redirect('/login');
  }

  return (
    <div className={styles.container}>
      <header className={styles.header}>
        <h1 className={styles.title}>Dashboard</h1>
        <div className={styles.userInfo}>
          <span className={styles.email}>{user.email}</span>
          <LogoutButton />
        </div>
      </header>

      <div className={styles.welcome}>
        <p className={styles.welcomeText}>
          Welcome to AML Hub. You are signed in as {user.email}.
        </p>
      </div>

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
      </nav>
    </div>
  );
}
