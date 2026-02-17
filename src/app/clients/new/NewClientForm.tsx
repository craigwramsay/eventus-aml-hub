'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClientAction } from '@/app/actions/clients';
import styles from '../clients.module.css';

const CLIENT_TYPES = [
  'Individual',
  'Private company limited by shares',
  'Private company limited by guarantee',
  'Public limited company',
  'LLP',
  'Partnership',
  'Trustee(s) of a trust',
  'Unincorporated association',
];

const SECTORS = [
  'Professional services',
  'Property holding',
  'Manufacturing',
  'Retail',
  'Hospitality / cash-intensive trade',
  'Construction',
  'Transport',
  'Cryptoasset activity',
  'Gambling',
  'Private wealth / family office',
  'Unregulated financial services',
  'Property development (offshore structures)',
  'Other',
];

export function NewClientForm() {
  const router = useRouter();

  const [name, setName] = useState('');
  const [clientTypeLabel, setClientTypeLabel] = useState('Individual');
  const [clioContactId, setClioContactId] = useState('');

  const [registeredNumber, setRegisteredNumber] = useState('');
  const [registeredAddress, setRegisteredAddress] = useState('');
  const [tradingAddress, setTradingAddress] = useState('');
  const [sector, setSector] = useState('');
  const [amlRegulated, setAmlRegulated] = useState(false);

  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const isIndividual = clientTypeLabel === 'Individual';

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setIsSubmitting(true);

    try {
      const result = await createClientAction({
        name,
        entity_type: clientTypeLabel,
        clio_contact_id: clioContactId || null,
        registered_number: isIndividual ? null : registeredNumber,
        registered_address: isIndividual ? null : registeredAddress,
        trading_address: isIndividual ? null : tradingAddress,
        sector: isIndividual ? null : sector,
        aml_regulated: isIndividual ? false : amlRegulated,
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
        <label className={styles.label}>Client Name</label>
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          className={styles.input}
          required
          disabled={isSubmitting}
        />
      </div>

      <div className={styles.field}>
        <label className={styles.label}>Client Type</label>
        <select
          value={clientTypeLabel}
          onChange={(e) => setClientTypeLabel(e.target.value)}
          className={styles.select}
          disabled={isSubmitting}
        >
          {CLIENT_TYPES.map((type) => (
            <option key={type} value={type}>
              {type}
            </option>
          ))}
        </select>
      </div>

      <div className={styles.field}>
        <label className={styles.label}>Clio Contact ID (optional)</label>
        <input
          type="text"
          value={clioContactId}
          onChange={(e) => setClioContactId(e.target.value)}
          className={styles.input}
          disabled={isSubmitting}
        />
      </div>

      {!isIndividual && (
        <>
          <div className={styles.field}>
            <label className={styles.label}>Registered Number</label>
            <input
              type="text"
              value={registeredNumber}
              onChange={(e) => setRegisteredNumber(e.target.value)}
              className={styles.input}
              disabled={isSubmitting}
            />
          </div>

          <div className={styles.field}>
            <label className={styles.label}>Registered Address</label>
            <input
              type="text"
              value={registeredAddress}
              onChange={(e) => setRegisteredAddress(e.target.value)}
              className={styles.input}
              disabled={isSubmitting}
            />
          </div>

          <div className={styles.field}>
            <label className={styles.label}>Trading Address</label>
            <input
              type="text"
              value={tradingAddress}
              onChange={(e) => setTradingAddress(e.target.value)}
              className={styles.input}
              disabled={isSubmitting}
            />
          </div>

          <div className={styles.field}>
            <label className={styles.label}>Sector</label>
            <select
              value={sector}
              onChange={(e) => setSector(e.target.value)}
              className={styles.select}
              disabled={isSubmitting}
              required
            >
              <option value="">Select sector</option>
              {SECTORS.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </div>

          <div className={styles.field}>
            <label className={styles.label}>
              <input
                type="checkbox"
                checked={amlRegulated}
                onChange={(e) => setAmlRegulated(e.target.checked)}
                disabled={isSubmitting}
              />{' '}
              Client is AML regulated
            </label>
            <div style={{ fontSize: '0.85rem', marginTop: '0.5rem', color: '#6b7280' }}>
              Select “Yes” if the client is subject to AML supervision by a UK or EEA
              competent authority (e.g. FCA, HMRC, SRA, Law Society of Scotland).
              Select “No” for unregulated trading or holding companies.
            </div>
          </div>
        </>
      )}

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
