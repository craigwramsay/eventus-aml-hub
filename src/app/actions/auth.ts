'use server';

/**
 * Server Actions for Authentication
 */

import { createClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';

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

  const supabase = await createClient();

  const { error } = await supabase.auth.signInWithPassword({
    email,
    password,
  });

  if (error) {
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
