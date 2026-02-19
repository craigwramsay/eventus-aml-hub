'use client';

/**
 * New Client Form Component
 */

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClientAction } from '@/app/actions/clients';
import sectorMapping from '@/config/eventus/rules/sector_mapping.json';
import styles from '../clients.module.css';

type EntityType =
  | 'Individual'
  | 'Private company limited by shares'
  | 'Private company limited by guarantee'
  | 'Public limited company'
  | 'LLP'
  | 'Partnership'
  | 'Trustee(s) of a trust'
  | 'Unincorporated association';


export function NewClientForm() {
  const router = useRouter();
  const [name, setName] = useState('');
  const [entityType, setEntityType] = useState<EntityType>('Individual');
  const [sector, setSector] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Flatten sector options from config
  const sectorOptions = Object.values(sectorMapping.categories).flat();

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setIsSubmitting(true);

    try {
      const result = await createClientAction({
        name,
        entity_type: entityType,
        sector,
      });

      if (result.success) {
        router.push(`/clients/${result.client.id}`);
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
        <label htmlFor="name" className={styles.label}>
          Client Name
        </label>
        <input
          type="text"
          id="name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          className={styles.input}
          required
          disabled={isSubmitting}
        />
      </div>

      <div className={styles.field}>
  <label htmlFor="entityType" className={styles.label}>
    Client Type
  </label>
  <select
    id="entityType"
    value={entityType}
    onChange={(e) => setEntityType(e.target.value as EntityType)}
    className={styles.select}
    disabled={isSubmitting}
  >
    <option value="Individual">Individual</option>
    <option value="Private company limited by shares">Private company limited by shares</option>
    <option value="Private company limited by guarantee">Private company limited by guarantee</option>
    <option value="Public limited company">Public limited company</option>
    <option value="LLP">LLP</option>
    <option value="Partnership">Partnership</option>
    <option value="Trustee(s) of a trust">Trustee(s) of a trust</option>
    <option value="Unincorporated association">Unincorporated association</option>
  </select>
</div>


      <div className={styles.field}>
        <label htmlFor="sector" className={styles.label}>
          Client Sector
        </label>
        <select
          id="sector"
          value={sector}
          onChange={(e) => setSector(e.target.value)}
          className={styles.select}
          required
          disabled={isSubmitting}
        >
          <option value="">Select sector</option>
          {sectorOptions.map((option) => (
            <option key={option} value={option}>
              {option}
            </option>
          ))}
        </select>
      </div>

      <div className={styles.formActions}>
        <button
          type="submit"
          className={styles.primaryButton}
          disabled={isSubmitting}
        >
          {isSubmitting ? 'Creating...' : 'Create Client'}
        </button>
        <button
          type="button"
          className={styles.secondaryButton}
          onClick={() => router.push('/clients')}
          disabled={isSubmitting}
        >
          Cancel
        </button>
      </div>
    </form>
  );
}
