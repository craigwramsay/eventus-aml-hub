'use client';

import { useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { signOut as serverSignOut } from '@/app/actions/auth';
import { createClient } from '@/lib/supabase/client';
import styles from './sidebar.module.css';

export function LogoutButton() {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  const handleClick = () => {
    startTransition(async () => {
      try {
        // Clear the session client-side first so Supabase auth cookies
        // are dropped from this browser. Without this, an unawaited
        // server-action call could leave the cookies in place.
        const supabase = createClient();
        await supabase.auth.signOut();
      } catch (err) {
        // Non-fatal — the server action below will also clear server-side
        // cookies and redirect.
        console.warn('Client sign-out failed (continuing):', err);
      }

      // The server action also clears cookies and triggers a
      // server-side redirect. Calling it explicitly ensures the
      // server's view of the session is cleared even if the client
      // sign-out partially failed.
      try {
        await serverSignOut();
      } catch {
        // Server actions throw NEXT_REDIRECT on redirect; ignore.
      }

      // Force a hard navigation so any cached auth state is dropped.
      router.replace('/login');
      router.refresh();
    });
  };

  return (
    <button
      className={styles.logoutButton}
      onClick={handleClick}
      disabled={isPending}
    >
      {isPending ? 'Signing out…' : 'Sign Out'}
    </button>
  );
}
