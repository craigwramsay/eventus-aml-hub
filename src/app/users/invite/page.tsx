'use client';

/**
 * Invite User Page (Admin Only)
 */

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { inviteUser } from '@/app/actions/users';
import { ROLES, ROLE_LABELS } from '@/lib/auth/roles';
import type { UserRole } from '@/lib/auth/roles';
import styles from '../users.module.css';

export default function InviteUserPage() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [fullName, setFullName] = useState('');
  const [role, setRole] = useState<UserRole>('solicitor');
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setIsSubmitting(true);
    setError(null);

    const result = await inviteUser({ email, full_name: fullName, role });

    if (result.success) {
      router.push('/users');
    } else {
      setError(result.error);
      setIsSubmitting(false);
    }
  }

  return (
    <div className={styles.container}>
      <Link href="/users" className={styles.backLink}>
        &larr; Back to Users
      </Link>

      <h1 className={styles.title}>Invite User</h1>
      <p className={styles.subtitle}>
        Send an invitation to join your firm on AML Hub.
      </p>

      {error && <div className={styles.error}>{error}</div>}

      <form onSubmit={handleSubmit} className={styles.form}>
        <div className={styles.field}>
          <label className={styles.label}>Full Name</label>
          <input
            type="text"
            value={fullName}
            onChange={(e) => setFullName(e.target.value)}
            required
            className={styles.input}
          />
        </div>

        <div className={styles.field}>
          <label className={styles.label}>Email Address</label>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            className={styles.input}
          />
        </div>

        <div className={styles.field}>
          <label className={styles.label}>Role</label>
          <select
            value={role}
            onChange={(e) => setRole(e.target.value as UserRole)}
            className={styles.select}
          >
            {ROLES.map((r) => (
              <option key={r} value={r}>
                {ROLE_LABELS[r]}
              </option>
            ))}
          </select>
        </div>

        <button
          type="submit"
          disabled={isSubmitting}
          className={styles.primaryButton}
          style={{ width: '100%' }}
        >
          {isSubmitting ? 'Sending Invitation...' : 'Send Invitation'}
        </button>
      </form>
    </div>
  );
}
