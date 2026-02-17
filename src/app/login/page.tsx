/**
 * Login Page
 */

import { redirect } from 'next/navigation';
import { getUser } from '@/lib/supabase/server';
import { LoginForm } from './LoginForm';
import styles from './page.module.css';

export default async function LoginPage() {
  // Redirect to dashboard if already logged in
  const user = await getUser();
  if (user) {
    redirect('/dashboard');
  }

  return (
    <div className={styles.container}>
      <div className={styles.card}>
        <h1 className={styles.title}>AML Hub</h1>
        <p className={styles.subtitle}>Sign in to your account</p>
        <LoginForm />
      </div>
    </div>
  );
}
