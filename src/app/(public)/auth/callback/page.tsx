'use client';

/**
 * Auth Callback
 *
 * Handles Supabase auth code exchange and routes by type:
 * - invite → /invite/accept (set password for new user)
 * - recovery → /set-password (reset password)
 * - default → /dashboard (already authenticated)
 */

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';

export default function AuthCallback() {
  const router = useRouter();
  const supabase = createClient();

  useEffect(() => {
    const handleAuth = async () => {
      const url = new URL(window.location.href);
      const code = url.searchParams.get('code');
      const type = url.searchParams.get('type');

      if (!code) {
        router.push('/login');
        return;
      }

      const { error } = await supabase.auth.exchangeCodeForSession(code);

      if (error) {
        console.error('Auth exchange error:', error);
        router.push('/login');
        return;
      }

      // Route based on the auth flow type
      switch (type) {
        case 'invite':
          router.push('/invite/accept');
          break;
        case 'recovery':
          router.push('/set-password');
          break;
        default:
          router.push('/dashboard');
          break;
      }
    };

    handleAuth();
  }, [router, supabase]);

  return (
    <div style={{ maxWidth: '400px', margin: '4rem auto', padding: '2rem', textAlign: 'center' }}>
      <p>Setting up your account...</p>
    </div>
  );
}
