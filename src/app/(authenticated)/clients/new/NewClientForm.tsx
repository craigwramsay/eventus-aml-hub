'use client';

/**
 * New Client Form Component
 */

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClientAction, lookupCompanyForClient } from '@/app/actions/clients';
import type { CompanyLookupForClientResult } from '@/app/actions/clients';
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

  const [lastCddVerifiedAt, setLastCddVerifiedAt] = useState('');

  // Companies House lookup state
  const [registeredNumber, setRegisteredNumber] = useState('');
  const [registeredAddress, setRegisteredAddress] = useState('');
  const [lookupLoading, setLookupLoading] = useState(false);
  const [lookupError, setLookupError] = useState<string | null>(null);
  const [lookupResult, setLookupResult] = useState<
    Extract<CompanyLookupForClientResult, { success: true }> | null
  >(null);

  const isCorporate = entityType.toLowerCase() !== 'individual';

  // Flatten sector options from config
  const sectorOptions = Object.values(sectorMapping.categories).flat();

  function handleEntityTypeChange(value: string) {
    setEntityType(value as EntityType);
    // Clear CH state when switching to individual
    if (value.toLowerCase() === 'individual') {
      setRegisteredNumber('');
      setRegisteredAddress('');
      setLookupError(null);
      setLookupResult(null);
    }
  }

  async function handleLookup() {
    if (!registeredNumber.trim()) return;

    setLookupLoading(true);
    setLookupError(null);
    setLookupResult(null);
    setRegisteredAddress('');

    try {
      const result = await lookupCompanyForClient(registeredNumber);

      if (result.success) {
        setLookupResult(result);
        setRegisteredAddress(result.registeredAddress);
      } else {
        setLookupError(result.error);
      }
    } catch {
      setLookupError('An unexpected error occurred');
    } finally {
      setLookupLoading(false);
    }
  }

  function handleAdoptName() {
    if (lookupResult) {
      setName(lookupResult.companyName);
    }
  }

  function formatDate(dateStr: string): string {
    try {
      const date = new Date(dateStr);
      return date.toLocaleDateString('en-GB', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
      });
    } catch {
      return dateStr;
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setIsSubmitting(true);

    try {
      const result = await createClientAction({
        name,
        entity_type: entityType,
        sector,
        registered_number: isCorporate && registeredNumber ? registeredNumber.trim().toUpperCase() : null,
        registered_address: isCorporate && registeredAddress ? registeredAddress : null,
        last_cdd_verified_at: lastCddVerifiedAt || null,
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

  const showNameDifference =
    lookupResult &&
    name.trim() !== '' &&
    lookupResult.companyName.toUpperCase() !== name.trim().toUpperCase();

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
    onChange={(e) => handleEntityTypeChange(e.target.value)}
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

      {isCorporate && (
        <div className={styles.field}>
          <label htmlFor="registeredNumber" className={styles.label}>
            Company Number
          </label>
          <div className={styles.lookupRow}>
            <input
              type="text"
              id="registeredNumber"
              value={registeredNumber}
              onChange={(e) => setRegisteredNumber(e.target.value)}
              className={styles.input}
              placeholder="e.g. 12345678 or SC123456"
              disabled={isSubmitting || lookupLoading}
            />
            <button
              type="button"
              className={styles.lookupButton}
              onClick={handleLookup}
              disabled={isSubmitting || lookupLoading || !registeredNumber.trim()}
            >
              {lookupLoading ? 'Looking up...' : 'Look up'}
            </button>
          </div>

          {lookupError && (
            <div className={styles.lookupError}>{lookupError}</div>
          )}

          {lookupResult && (
            <div className={styles.lookupResult}>
              <div className={styles.lookupInfo}>
                {lookupResult.companyName} ({lookupResult.companyStatus}, incorporated{' '}
                {formatDate(lookupResult.incorporationDate)})
              </div>
              <div className={styles.lookupAddress}>
                Registered address: {lookupResult.registeredAddress}
              </div>
              {showNameDifference && (
                <button
                  type="button"
                  className={styles.adoptNameButton}
                  onClick={handleAdoptName}
                >
                  Use Companies House name: {lookupResult.companyName}
                </button>
              )}
            </div>
          )}
        </div>
      )}

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

      <div className={styles.field}>
        <label htmlFor="lastCddVerifiedAt" className={styles.label}>
          Date of Last Identity Verification (optional)
        </label>
        <input
          type="date"
          id="lastCddVerifiedAt"
          value={lastCddVerifiedAt}
          onChange={(e) => setLastCddVerifiedAt(e.target.value)}
          className={styles.input}
          disabled={isSubmitting}
        />
        <span className={styles.hint}>
          If this client has been verified previously (e.g. via Amiqus), enter the date here to enable carry-forward.
        </span>
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
