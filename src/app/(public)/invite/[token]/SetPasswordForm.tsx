'use client';

/**
 * Password-set form for the token-based invitation flow.
 *
 * On submit:
 *   1. Calls the acceptInvitation server action with token + password.
 *      That creates the auth.users row (via signUp), inserts the
 *      user_profile, and marks the invitation accepted.
 *   2. Signs the user in client-side (so the auth session cookies
 *      end up bound to this browser, not the server action's transient
 *      client) and redirects to the MFA setup page.
 */

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { acceptInvitation } from '@/app/actions/users';
import { createClient } from '@/lib/supabase/client';
import { validatePassword } from '@/lib/security/password-policy';
import styles from './invite.module.css';

interface Props {
  token: string;
  email: string;
}

export default function SetPasswordForm({ token, email }: Props) {
  const router = useRouter();
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (password !== confirmPassword) {
      setError('Passwords do not match');
      return;
    }

    const validation = validatePassword(password);
    if (!validation.valid) {
      setError(validation.errors.join('. '));
      return;
    }

    setIsSubmitting(true);

    const result = await acceptInvitation({ token, password });
    if (!result.success) {
      setError(result.error);
      setIsSubmitting(false);
      return;
    }

    // Sign the user in client-side so the session cookies are set in
    // this browser. The server action's client is short-lived.
    const supabase = createClient();
    const { error: signInErr } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (signInErr) {
      // Account was created, but auto-sign-in failed. Send them to /login.
      router.push('/login');
      return;
    }

    router.push('/mfa/setup');
  }

  return (
    <form onSubmit={handleSubmit} className={styles.form}>
      <p className={styles.helper}>
        Set a password to complete your account. Must be at least 12 characters
        with uppercase, lowercase, digit, and special character.
      </p>

      {error && <div className={styles.error}>{error}</div>}

      <div className={styles.field}>
        <label htmlFor="password" className={styles.label}>Password</label>
        <input
          id="password"
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
          minLength={12}
          autoComplete="new-password"
          className={styles.input}
        />
      </div>

      <div className={styles.field}>
        <label htmlFor="confirm-password" className={styles.label}>Confirm password</label>
        <input
          id="confirm-password"
          type="password"
          value={confirmPassword}
          onChange={(e) => setConfirmPassword(e.target.value)}
          required
          minLength={12}
          autoComplete="new-password"
          className={styles.input}
        />
      </div>

      <button type="submit" disabled={isSubmitting} className={styles.submit}>
        {isSubmitting ? 'Setting password...' : 'Set password & continue'}
      </button>
    </form>
  );
}
