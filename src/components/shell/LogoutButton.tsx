'use client';

import { useState } from 'react';
import { signOut as serverSignOut } from '@/app/actions/auth';
import { createClient } from '@/lib/supabase/client';
import styles from './sidebar.module.css';

export function LogoutButton() {
  const [isSigningOut, setIsSigningOut] = useState(false);

  const handleClick = async () => {
    setIsSigningOut(true);

    try {
      // Clear the session client-side first so Supabase auth cookies
      // are dropped from this browser.
      const supabase = createClient();
      await supabase.auth.signOut();
    } catch (err) {
      console.warn('Client sign-out failed (continuing):', err);
    }

    // Also clear server-side cookies via the server action. We swallow
    // any error including the NEXT_REDIRECT throw — we'll force the
    // navigation ourselves below to guarantee a full reload.
    try {
      await serverSignOut();
    } catch {
      /* ignore */
    }

    // Hard navigation — clears all client-side state (router cache,
    // server-component caches, etc). router.replace() did a soft
    // navigation that left the dashboard mounted with stale state.
    window.location.href = '/login';
  };

  return (
    <button
      className={styles.logoutButton}
      onClick={handleClick}
      disabled={isSigningOut}
    >
      {isSigningOut ? 'Signing out…' : 'Sign Out'}
    </button>
  );
}
