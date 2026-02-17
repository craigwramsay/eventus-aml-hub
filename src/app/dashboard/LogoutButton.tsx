'use client';

/**
 * Logout Button Component
 */

import { signOut } from '@/app/actions/auth';
import styles from './page.module.css';

export function LogoutButton() {
  return (
    <button className={styles.logoutButton} onClick={() => signOut()}>
      Sign Out
    </button>
  );
}
