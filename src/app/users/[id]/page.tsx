'use client';

/**
 * User Detail/Edit Page (Admin Only)
 */

import { useState, useEffect } from 'react';
import { useRouter, useParams } from 'next/navigation';
import Link from 'next/link';
import { updateUserRole, deactivateUser, sendPasswordReset, getUsersForFirm } from '@/app/actions/users';
import { ROLES, ROLE_LABELS } from '@/lib/auth/roles';
import type { UserRole } from '@/lib/auth/roles';
import type { UserProfile } from '@/lib/supabase/types';
import styles from '../users.module.css';

export default function UserDetailPage() {
  const router = useRouter();
  const params = useParams();
  const userId = params.id as string;

  const [user, setUser] = useState<UserProfile | null>(null);
  const [selectedRole, setSelectedRole] = useState<UserRole>('solicitor');
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [isUpdating, setIsUpdating] = useState(false);

  useEffect(() => {
    async function loadUser() {
      const users = await getUsersForFirm();
      const found = users.find((u) => u.user_id === userId);
      if (found) {
        setUser(found);
        setSelectedRole(found.role);
      }
    }
    loadUser();
  }, [userId]);

  async function handleUpdateRole() {
    setIsUpdating(true);
    setError(null);
    setSuccess(null);

    const result = await updateUserRole(userId, selectedRole);

    if (result.success) {
      setSuccess('Role updated successfully');
    } else {
      setError(result.error);
    }

    setIsUpdating(false);
  }

  async function handlePasswordReset() {
    setError(null);
    setSuccess(null);
    setIsUpdating(true);

    const result = await sendPasswordReset(userId);

    if (result.success) {
      setSuccess('Password reset email sent');
    } else {
      setError(result.error);
    }

    setIsUpdating(false);
  }

  async function handleDeactivate() {
    const confirmed = window.confirm(
      'Are you sure you want to deactivate this user? This action should be followed up in the Supabase dashboard.'
    );
    if (!confirmed) return;

    const result = await deactivateUser(userId);

    if (result.success) {
      router.push('/users');
    } else {
      setError(result.error);
    }
  }

  if (!user) {
    return (
      <div className={styles.container}>
        <p>Loading user...</p>
      </div>
    );
  }

  return (
    <div className={styles.container}>
      <Link href="/users" className={styles.backLink}>
        &larr; Back to Users
      </Link>

      <h1 className={styles.title}>
        {user.full_name || user.email || 'User'}
      </h1>

      <div className={styles.detailMeta}>
        {user.email && <p>Email: {user.email}</p>}
        <p>Current Role: {ROLE_LABELS[user.role]}</p>
        <p>Joined: {new Date(user.created_at).toLocaleDateString('en-GB')}</p>
      </div>

      {error && <div className={styles.error}>{error}</div>}
      {success && <div className={styles.success}>{success}</div>}

      <div className={styles.section}>
        <h2 className={styles.sectionTitle}>Change Role</h2>
        <div className={styles.roleChangeRow}>
          <select
            value={selectedRole}
            onChange={(e) => setSelectedRole(e.target.value as UserRole)}
            className={styles.select}
          >
            {ROLES.map((r) => (
              <option key={r} value={r}>
                {ROLE_LABELS[r]}
              </option>
            ))}
          </select>
          <button
            onClick={handleUpdateRole}
            disabled={isUpdating || selectedRole === user.role}
            className={styles.primaryButton}
          >
            {isUpdating ? 'Updating...' : 'Update'}
          </button>
        </div>
      </div>

      <div className={styles.section}>
        <h2 className={styles.sectionTitle}>Password Reset</h2>
        <button
          onClick={handlePasswordReset}
          disabled={isUpdating}
          className={styles.indigoButton}
        >
          {isUpdating ? 'Sending...' : 'Send Password Reset Email'}
        </button>
      </div>

      <div className={styles.dangerSection}>
        <h2 className={styles.sectionTitle}>Danger Zone</h2>
        <button
          onClick={handleDeactivate}
          className={styles.dangerButton}
        >
          Deactivate User
        </button>
      </div>
    </div>
  );
}
