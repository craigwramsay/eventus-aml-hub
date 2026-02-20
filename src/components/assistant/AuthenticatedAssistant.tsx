'use client';

/**
 * Authenticated Assistant Wrapper
 *
 * Only renders the GlobalAssistantButton when the user has an active session.
 * Listens for auth state changes so the button appears/disappears on login/logout.
 */

import { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { GlobalAssistantButton } from './GlobalAssistantButton';

export function AuthenticatedAssistant() {
  const [isAuthenticated, setIsAuthenticated] = useState(false);

  useEffect(() => {
    const supabase = createClient();

    // Check initial session
    supabase.auth.getSession().then(({ data: { session } }) => {
      setIsAuthenticated(Boolean(session));
    });

    // Listen for auth changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setIsAuthenticated(Boolean(session));
    });

    return () => subscription.unsubscribe();
  }, []);

  if (!isAuthenticated) return null;

  return <GlobalAssistantButton />;
}
