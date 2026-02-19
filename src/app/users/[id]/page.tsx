'use client';

/**
 * User Detail/Edit Page (Admin Only)
 */

import { useState, useEffect } from 'react';
import { useRouter, useParams } from 'next/navigation';
import Link from 'next/link';
import { updateUserRole, deactivateUser, getUsersForFirm } from '@/app/actions/users';
import { ROLES, ROLE_LABELS } from '@/lib/auth/roles';
import type { UserRole } from '@/lib/auth/roles';
import type { UserProfile } from '@/lib/supabase/types';

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
      <div style={{ maxWidth: '500px', margin: '0 auto', padding: '2rem' }}>
        <p>Loading user...</p>
      </div>
    );
  }

  return (
    <div style={{ maxWidth: '500px', margin: '0 auto', padding: '2rem' }}>
      <Link href="/users" style={{ fontSize: '0.875rem', color: '#6366f1' }}>
        &larr; Back to Users
      </Link>

      <h1 style={{ marginTop: '1rem', fontSize: '1.75rem' }}>
        {user.full_name || user.email || 'User'}
      </h1>

      <div style={{ marginBottom: '1.5rem', color: '#666' }}>
        {user.email && <p>Email: {user.email}</p>}
        <p>Current Role: {ROLE_LABELS[user.role]}</p>
        <p>Joined: {new Date(user.created_at).toLocaleDateString('en-GB')}</p>
      </div>

      {error && (
        <div style={{ color: '#991b1b', background: '#fee2e2', padding: '0.75rem', borderRadius: '0.375rem', marginBottom: '1rem' }}>
          {error}
        </div>
      )}

      {success && (
        <div style={{ color: '#166534', background: '#f0fdf4', padding: '0.75rem', borderRadius: '0.375rem', marginBottom: '1rem' }}>
          {success}
        </div>
      )}

      <div style={{ marginBottom: '2rem' }}>
        <h2 style={{ fontSize: '1.125rem', marginBottom: '0.5rem' }}>Change Role</h2>
        <div style={{ display: 'flex', gap: '0.5rem' }}>
          <select
            value={selectedRole}
            onChange={(e) => setSelectedRole(e.target.value as UserRole)}
            style={{ padding: '0.75rem', border: '1px solid #e5e5e5', borderRadius: '0.375rem', flex: 1 }}
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
            style={{
              padding: '0.75rem 1.5rem',
              backgroundColor: '#4f46e5',
              color: 'white',
              border: 'none',
              borderRadius: '0.375rem',
              cursor: isUpdating || selectedRole === user.role ? 'not-allowed' : 'pointer',
            }}
          >
            {isUpdating ? 'Updating...' : 'Update'}
          </button>
        </div>
      </div>

      <div style={{ borderTop: '1px solid #fee2e2', paddingTop: '1.5rem' }}>
        <h2 style={{ fontSize: '1.125rem', color: '#991b1b', marginBottom: '0.5rem' }}>
          Danger Zone
        </h2>
        <button
          onClick={handleDeactivate}
          style={{
            padding: '0.75rem 1.5rem',
            backgroundColor: '#fee2e2',
            color: '#991b1b',
            border: '1px solid #fecaca',
            borderRadius: '0.375rem',
            cursor: 'pointer',
          }}
        >
          Deactivate User
        </button>
      </div>
    </div>
  );
}
