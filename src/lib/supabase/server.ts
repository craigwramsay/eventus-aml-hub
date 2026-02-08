/**
 * Supabase Server Client
 *
 * Creates a Supabase client for use in Server Components and Server Actions.
 * Uses cookies for authentication - respects RLS policies.
 * Does NOT use service role key.
 */

import { createServerClient, type CookieOptions } from '@supabase/ssr';
import { cookies } from 'next/headers';
import type { UserProfile } from './types';

/**
 * Create a Supabase client for server-side operations
 * This client respects RLS and uses the authenticated user's session
 */
export async function createClient() {
  const cookieStore = await cookies();

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet: { name: string; value: string; options: CookieOptions }[]) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            );
          } catch {
            // The `setAll` method was called from a Server Component.
            // This can be ignored if you have middleware refreshing
            // user sessions.
          }
        },
      },
    }
  );
}

/**
 * Get the current authenticated user
 * Returns null if not authenticated
 */
export async function getUser() {
  const supabase = await createClient();
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();

  if (error || !user) {
    return null;
  }

  return user;
}

/**
 * Get the current user's profile including firm_id
 * Returns null if not authenticated or profile doesn't exist
 */
export async function getUserProfile(): Promise<UserProfile | null> {
  const supabase = await createClient();
  const user = await getUser();

  if (!user) {
    return null;
  }

  const { data: profile, error } = await supabase
    .from('user_profiles')
    .select('*')
    .eq('id', user.id)
    .single();

  if (error || !profile) {
    return null;
  }

  return profile as UserProfile;
}
