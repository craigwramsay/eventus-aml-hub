'use client';

import { useState, useEffect, useRef, useTransition } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import type { Client } from '@/lib/supabase/types';
import type { MatterParty } from '@/app/actions/matters';
import {
  addCoClientToMatter,
  removeCoClientFromMatter,
  searchHubClientsByName,
} from '@/app/actions/matters';
import styles from '../matters.module.css';

interface MatterPartiesProps {
  matterId: string;
  parties: MatterParty[];
  canEdit: boolean;
}

export function MatterParties({ matterId, parties, canEdit }: MatterPartiesProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  // Picker state
  const [isPicking, setIsPicking] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [results, setResults] = useState<Client[]>([]);
  const [searching, setSearching] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const excludeIds = parties.map((p) => p.client.id);

  useEffect(() => {
    if (!isPicking) return;
    const trimmed = searchTerm.trim();
    if (trimmed.length < 2) {
      setResults([]);
      return;
    }
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(async () => {
      setSearching(true);
      try {
        const found = await searchHubClientsByName(trimmed, excludeIds, 10);
        setResults(found);
      } finally {
        setSearching(false);
      }
    }, 350);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
    // excludeIds is derived from parties (a prop) and serialised below
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchTerm, isPicking, excludeIds.join(',')]);

  const handleAddCoClient = (clientId: string) => {
    setError(null);
    startTransition(async () => {
      const result = await addCoClientToMatter(matterId, clientId);
      if (result.success) {
        setIsPicking(false);
        setSearchTerm('');
        setResults([]);
        router.refresh();
      } else {
        setError(result.error);
      }
    });
  };

  const handleRemoveCoClient = (clientId: string, name: string) => {
    if (!window.confirm(`Remove ${name} as a co-client on this matter?`)) return;
    setError(null);
    startTransition(async () => {
      const result = await removeCoClientFromMatter(matterId, clientId);
      if (result.success) {
        router.refresh();
      } else {
        setError(result.error);
      }
    });
  };

  return (
    <div className={styles.section}>
      <div className={styles.sectionHeader}>
        <h2>Client{parties.length === 1 ? '' : 's'} on this matter</h2>
        {canEdit && !isPicking && (
          <button
            type="button"
            className={styles.primaryButton}
            onClick={() => {
              setError(null);
              setSearchTerm('');
              setResults([]);
              setIsPicking(true);
            }}
          >
            Add Co-Client
          </button>
        )}
      </div>

      {error && <div className={styles.partyError}>{error}</div>}

      <ul className={styles.partyList}>
        {parties.map((p) => (
          <li key={p.client.id} className={styles.partyRow}>
            <div className={styles.partyInfo}>
              <Link href={`/clients/${p.client.id}`} className={styles.tableLink}>
                {p.client.name}
              </Link>
              <span className={styles.partyMeta}>
                {p.client.client_type === 'individual' ? 'Individual' : 'Corporate'}
                {p.role === 'primary' ? ' · Primary (from Clio)' : ' · Co-client'}
                {p.client.clio_contact_id && ' · Clio-linked'}
              </span>
            </div>
            {canEdit && p.role === 'co_client' && (
              <button
                type="button"
                className={styles.partyRemoveButton}
                onClick={() => handleRemoveCoClient(p.client.id, p.client.name)}
                disabled={isPending}
              >
                Remove
              </button>
            )}
            {p.role === 'primary' && (
              <span className={styles.partyPrimaryBadge}>Primary</span>
            )}
          </li>
        ))}
      </ul>

      {isPicking && (
        <div className={styles.partyPicker}>
          <div className={styles.partyPickerRow}>
            <input
              type="text"
              className={styles.partyPickerInput}
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Search existing Hub clients by name…"
              autoFocus
              disabled={isPending}
            />
            <button
              type="button"
              className={styles.partyCancelButton}
              onClick={() => {
                setIsPicking(false);
                setSearchTerm('');
                setResults([]);
                setError(null);
              }}
              disabled={isPending}
            >
              Cancel
            </button>
          </div>
          {searching && results.length === 0 && (
            <div className={styles.partyPickerHint}>Searching…</div>
          )}
          {!searching && searchTerm.trim().length >= 2 && results.length === 0 && (
            <div className={styles.partyPickerHint}>
              No Hub clients matching that name.{' '}
              <Link href="/clients/new" className={styles.tableLink}>
                Create a new one
              </Link>{' '}
              and come back to add as co-client.
            </div>
          )}
          {results.length > 0 && (
            <ul className={styles.partyPickerResults}>
              {results.map((c) => (
                <li key={c.id} className={styles.partyPickerResultRow}>
                  <div className={styles.partyInfo}>
                    <span>{c.name}</span>
                    <span className={styles.partyMeta}>
                      {c.client_type === 'individual' ? 'Individual' : 'Corporate'}
                      {c.clio_contact_id && ' · Clio-linked'}
                    </span>
                  </div>
                  <button
                    type="button"
                    className={styles.primaryButton}
                    onClick={() => handleAddCoClient(c.id)}
                    disabled={isPending}
                  >
                    {isPending ? 'Adding…' : 'Add as co-client'}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {parties.some((p) => p.role === 'co_client') && (
        <p className={styles.partyCddNote}>
          CDD (identity verification, source of funds, etc.) must be completed for every named party.
        </p>
      )}
    </div>
  );
}
