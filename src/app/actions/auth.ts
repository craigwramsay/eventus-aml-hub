'use server';

/**
 * Server Actions for Authentication
 */

import { createClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { headers } from 'next/headers';
import { checkRateLimit, RATE_LIMITS } from '@/lib/security/rate-limiter';

export interface LoginInput {
  email: string;
  password: string;
}

export interface AuthResult {
  success: boolean;
  error?: string;
}

/**
 * Sign in with email and password
 */
export async function signIn(input: LoginInput): Promise<AuthResult> {
  const { email, password } = input;

  if (!email || !password) {
    return {
      success: false,
      error: 'Email and password are required',
    };
  }

  // Rate limit by IP
  const headersList = await headers();
  const ip = headersList.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown';
  const rateCheck = checkRateLimit(`login:${ip}`, RATE_LIMITS.login);
  if (!rateCheck.allowed) {
    return {
      success: false,
      error: 'Too many login attempts. Please try again later.',
    };
  }

  const supabase = await createClient();

  const { error } = await supabase.auth.signInWithPassword({
    email,
    password,
  });

  if (error) {
    // Log failed login attempt for audit
    console.warn(`Failed login attempt for ${email} from ${ip}: ${error.message}`);
    return {
      success: false,
      error: error.message,
    };
  }

  revalidatePath('/', 'layout');
  return { success: true };
}

/**
 * Sign out the current user
 */
export async function signOut(): Promise<void> {
  const supabase = await createClient();
  await supabase.auth.signOut();
  revalidatePath('/', 'layout');
  redirect('/login');
}
