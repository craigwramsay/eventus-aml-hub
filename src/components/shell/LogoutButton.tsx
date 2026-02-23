'use client';

import { signOut } from '@/app/actions/auth';
import styles from './sidebar.module.css';

export function LogoutButton() {
  return (
    <button className={styles.logoutButton} onClick={() => signOut()}>
      Sign Out
    </button>
  );
}
