'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';

export default function AuthCallback() {
  const router = useRouter();
  const supabase = createClient();

  useEffect(() => {
    const handleAuth = async () => {
      const code = new URL(window.location.href).searchParams.get('code');
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

      router.push('/set-password');
    };

    handleAuth();
  }, [router, supabase]);

  return <p>Setting up your account...</p>;
}
