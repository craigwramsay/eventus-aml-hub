'use client';

/**
 * Edit Client Details Form.
 *
 * Fills in fields that Clio doesn't provide on auto-import (specific entity
 * type, sector, Companies House data) so an assessment can pre-populate.
 *
 * Doesn't edit the name — use the inline rename on the client detail page
 * for that.
 */

import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import {
  updateClientAction,
  lookupCompanyForClient,
} from '@/app/actions/clients';
import type {
  CompanyLookupForClientResult,
} from '@/app/actions/clients';
import type { Client } from '@/lib/supabase/types';
import sectorMapping from '@/config/eventus/rules/sector_mapping.json';
import styles from '../../clients.module.css';

type EntityType =
  | 'Individual'
  | 'Private company limited by shares'
  | 'Private company limited by guarantee'
  | 'Public limited company'
  | 'LLP'
  | 'Partnership'
  | 'Trustee(s) of a trust'
  | 'Unincorporated association';

const ENTITY_TYPES: EntityType[] = [
  'Individual',
  'Private company limited by shares',
  'Private company limited by guarantee',
  'Public limited company',
  'LLP',
  'Partnership',
  'Trustee(s) of a trust',
  'Unincorporated association',
];

interface EditClientFormProps {
  client: Client;
}

/** True when the stored entity_type isn't one of the form's known values
 * (e.g., Clio's generic "corporate" / "individual"). */
function isMatchingEntityType(value: string | null | undefined): value is EntityType {
  return !!value && (ENTITY_TYPES as string[]).includes(value);
}

export function EditClientForm({ client }: EditClientFormProps) {
  const router = useRouter();

  // Choose a sensible default for entity_type when the stored value isn't a
  // known dropdown option. Use the client_type ('individual'|'corporate') as
  // the hint — Individual stays Individual; corporate defaults to the most
  // common UK option (Private company limited by shares).
  const initialEntityType: EntityType = isMatchingEntityType(client.entity_type)
    ? (client.entity_type as EntityType)
    : client.client_type === 'individual'
      ? 'Individual'
      : 'Private company limited by shares';

  const [entityType, setEntityType] = useState<EntityType>(initialEntityType);
  const [sector, setSector] = useState(
    client.sector && client.sector.toLowerCase() !== 'general' ? client.sector : ''
  );
  const [registeredNumber, setRegisteredNumber] = useState(client.registered_number ?? '');
  const [registeredAddress, setRegisteredAddress] = useState(client.registered_address ?? '');
  const [tradingAddress, setTradingAddress] = useState(client.trading_address ?? '');
  const [amlRegulated, setAmlRegulated] = useState<boolean>(client.aml_regulated ?? false);

  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Companies House lookup — same pattern as NewClientForm
  const [lookupLoading, setLookupLoading] = useState(false);
  const [lookupError, setLookupError] = useState<string | null>(null);
  const [lookupResult, setLookupResult] = useState<
    Extract<CompanyLookupForClientResult, { success: true }> | null
  >(null);

  const isCorporate = entityType.toLowerCase() !== 'individual';

  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (!isCorporate) return;
    const trimmed = registeredNumber.trim().toUpperCase();
    const isValid = /^(?:\d{8}|[A-Z]{2}\d{6})$/.test(trimmed);
    if (!isValid) return;
    if (lookupResult && lookupResult.companyNumber?.toUpperCase() === trimmed) return;

    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(async () => {
      setLookupLoading(true);
      setLookupError(null);
      setLookupResult(null);
      try {
        const result = await lookupCompanyForClient(trimmed);
        if (result.success) {
          setLookupResult(result);
          if (!registeredAddress.trim()) {
            setRegisteredAddress(result.registeredAddress);
          }
        } else {
          setLookupError(result.error);
        }
      } catch {
        setLookupError('An unexpected error occurred');
      } finally {
        setLookupLoading(false);
      }
    }, 500);

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [registeredNumber, isCorporate, lookupResult, registeredAddress]);

  function handleEntityTypeChange(value: string) {
    setEntityType(value as EntityType);
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

  const sectorOptions = Object.values(sectorMapping.categories).flat();

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setIsSubmitting(true);
    try {
      const result = await updateClientAction(client.id, {
        entity_type: entityType,
        sector: sector || undefined,
        registered_number: isCorporate
          ? registeredNumber.trim().toUpperCase() || null
          : null,
        registered_address: isCorporate ? registeredAddress || null : null,
        trading_address: tradingAddress || null,
        aml_regulated: amlRegulated,
      });
      if (result.success) {
        router.push(`/clients/${client.id}`);
        router.refresh();
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
        <label htmlFor="entityType" className={styles.label}>
          Entity Type
        </label>
        <select
          id="entityType"
          value={entityType}
          onChange={(e) => handleEntityTypeChange(e.target.value)}
          className={styles.select}
          disabled={isSubmitting}
        >
          {ENTITY_TYPES.map((t) => (
            <option key={t} value={t}>
              {t}
            </option>
          ))}
        </select>
        {!isMatchingEntityType(client.entity_type) && (
          <span className={styles.hint}>
            Currently stored as <code>{client.entity_type}</code> — pick the specific entity
            type so the assessment form can pre-populate.
          </span>
        )}
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
          {lookupError && <div className={styles.lookupError}>{lookupError}</div>}
          {lookupResult && (
            <div className={styles.lookupResult}>
              <div className={styles.lookupInfo}>
                {lookupResult.companyName} ({lookupResult.companyStatus})
              </div>
              <div className={styles.lookupAddress}>
                Registered address: {lookupResult.registeredAddress}
              </div>
            </div>
          )}
        </div>
      )}

      {isCorporate && (
        <div className={styles.field}>
          <label htmlFor="registeredAddress" className={styles.label}>
            Registered Address
          </label>
          <textarea
            id="registeredAddress"
            value={registeredAddress}
            onChange={(e) => setRegisteredAddress(e.target.value)}
            className={styles.input}
            rows={2}
            disabled={isSubmitting}
          />
        </div>
      )}

      <div className={styles.field}>
        <label htmlFor="tradingAddress" className={styles.label}>
          Trading Address (optional)
        </label>
        <textarea
          id="tradingAddress"
          value={tradingAddress}
          onChange={(e) => setTradingAddress(e.target.value)}
          className={styles.input}
          rows={2}
          disabled={isSubmitting}
        />
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
        {(!client.sector || client.sector.toLowerCase() === 'general') && (
          <span className={styles.hint}>
            Sector currently unset — required for corporate clients to run an assessment.
          </span>
        )}
      </div>

      <div className={styles.field}>
        <label className={styles.label}>
          <input
            type="checkbox"
            checked={amlRegulated}
            onChange={(e) => setAmlRegulated(e.target.checked)}
            disabled={isSubmitting}
          />
          {' '}AML-regulated entity
        </label>
        <span className={styles.hint}>
          Tick if this client is itself an AML-regulated entity (other law firm, accountant
          subject to AML obligations, etc.).
        </span>
      </div>

      <div className={styles.formActions}>
        <button type="submit" className={styles.primaryButton} disabled={isSubmitting}>
          {isSubmitting ? 'Saving...' : 'Save details'}
        </button>
        <button
          type="button"
          className={styles.secondaryButton}
          onClick={() => router.push(`/clients/${client.id}`)}
          disabled={isSubmitting}
        >
          Cancel
        </button>
      </div>
    </form>
  );
}
