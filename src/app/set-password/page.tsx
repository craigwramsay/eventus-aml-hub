'use client';

/**
 * Set Password Page
 *
 * Used for password recovery flow. Users land here from auth callback
 * after clicking a password-reset link.
 */

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { validatePassword } from '@/lib/security/password-policy';

export default function SetPasswordPage() {
  const supabase = createClient();
  const router = useRouter();

  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
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

    const { error: updateError } = await supabase.auth.updateUser({
      password,
    });

    if (updateError) {
      setError(updateError.message);
      setIsSubmitting(false);
      return;
    }

    router.push('/mfa/setup');
  };

  return (
    <div style={{ maxWidth: '400px', margin: '4rem auto', padding: '2rem' }}>
      <h1 style={{ fontSize: '1.5rem', marginBottom: '0.5rem' }}>Set Your Password</h1>
      <p style={{ color: '#666', marginBottom: '1.5rem' }}>
        Password must be at least 12 characters with uppercase, lowercase, digit,
        and special character.
      </p>

      {error && (
        <div style={{ color: '#991b1b', background: '#fee2e2', padding: '0.75rem', borderRadius: '0.375rem', marginBottom: '1rem' }}>
          {error}
        </div>
      )}

      <form onSubmit={handleSubmit}>
        <div style={{ marginBottom: '1rem' }}>
          <label style={{ display: 'block', marginBottom: '0.25rem', fontWeight: 500 }}>
            New Password
          </label>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            minLength={12}
            style={{ width: '100%', padding: '0.75rem', border: '1px solid #e5e5e5', borderRadius: '0.375rem' }}
          />
        </div>

        <div style={{ marginBottom: '1.5rem' }}>
          <label style={{ display: 'block', marginBottom: '0.25rem', fontWeight: 500 }}>
            Confirm Password
          </label>
          <input
            type="password"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            required
            minLength={12}
            style={{ width: '100%', padding: '0.75rem', border: '1px solid #e5e5e5', borderRadius: '0.375rem' }}
          />
        </div>

        <button
          type="submit"
          disabled={isSubmitting}
          style={{
            width: '100%',
            padding: '0.75rem',
            backgroundColor: '#4f46e5',
            color: 'white',
            border: 'none',
            borderRadius: '0.375rem',
            cursor: isSubmitting ? 'not-allowed' : 'pointer',
            fontSize: '1rem',
          }}
        >
          {isSubmitting ? 'Setting Password...' : 'Set Password & Continue'}
        </button>
      </form>
    </div>
  );
}
