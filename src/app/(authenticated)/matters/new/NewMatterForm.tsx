'use client';

/**
 * New Matter Form Component
 */

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { createMatterAction } from '@/app/actions/matters';
import type { Client } from '@/lib/supabase/types';
import styles from '../matters.module.css';

interface NewMatterFormProps {
  clients: Client[];
  preselectedClientId?: string;
}

export function NewMatterForm({ clients, preselectedClientId }: NewMatterFormProps) {
  const router = useRouter();
  const [clientId, setClientId] = useState(preselectedClientId || '');
  const [description, setDescription] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setIsSubmitting(true);

    try {
      const result = await createMatterAction({
        client_id: clientId,
        description: description || undefined,
      });

      if (result.success) {
        router.push(`/matters/${result.matter.id}`);
      } else {
        setError(result.error);
      }
    } catch {
      setError('An unexpected error occurred');
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className={styles.form}>
      {error && <div className={styles.error}>{error}</div>}

      <div className={styles.field}>
        <label htmlFor="clientId" className={styles.label}>
          Client
        </label>
        <select
          id="clientId"
          value={clientId}
          onChange={(e) => setClientId(e.target.value)}
          className={styles.select}
          required
          disabled={isSubmitting}
        >
          <option value="">Select a client...</option>
          {clients.map((client) => (
            <option key={client.id} value={client.id}>
              {client.name} ({client.client_type})
            </option>
          ))}
        </select>
      </div>

      <div className={styles.field}>
        <label htmlFor="description" className={styles.label}>
          Description (optional)
        </label>
        <textarea
          id="description"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          className={styles.textarea}
          placeholder="Brief description of the matter..."
          disabled={isSubmitting}
        />
      </div>

      <div className={styles.formActions}>
        <button
          type="submit"
          className={styles.primaryButton}
          disabled={isSubmitting || !clientId}
        >
          {isSubmitting ? 'Creating...' : 'Create Matter'}
        </button>
        <button
          type="button"
          className={styles.secondaryButton}
          onClick={() => router.push('/matters')}
          disabled={isSubmitting}
        >
          Cancel
        </button>
      </div>
    </form>
  );
}
