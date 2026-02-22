'use client';

/**
 * Clients List with client-side search and type filtering
 */

import { useState } from 'react';
import Link from 'next/link';
import type { Client } from '@/lib/supabase/types';
import styles from './clients.module.css';

type TypeFilter = 'all' | 'individual' | 'corporate';

interface ClientsListProps {
  clients: Client[];
}

function formatDate(dateString: string): string {
  return new Date(dateString).toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

export function ClientsList({ clients }: ClientsListProps) {
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState<TypeFilter>('all');

  const filtered = clients.filter((client) => {
    if (typeFilter !== 'all' && client.client_type !== typeFilter) return false;
    if (search) {
      const term = search.toLowerCase();
      return (
        client.name.toLowerCase().includes(term) ||
        client.entity_type.toLowerCase().includes(term)
      );
    }
    return true;
  });

  const individualCount = clients.filter((c) => c.client_type === 'individual').length;
  const corporateCount = clients.filter((c) => c.client_type === 'corporate').length;

  return (
    <>
      <div className={styles.searchBar}>
        <input
          type="text"
          className={styles.searchInput}
          placeholder="Search clients..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      <div className={styles.filters}>
        <button
          type="button"
          className={`${styles.filterButton} ${typeFilter === 'all' ? styles.filterButtonActive : ''}`}
          onClick={() => setTypeFilter('all')}
        >
          All ({clients.length})
        </button>
        <button
          type="button"
          className={`${styles.filterButton} ${typeFilter === 'individual' ? styles.filterButtonActive : ''}`}
          onClick={() => setTypeFilter('individual')}
        >
          Individual ({individualCount})
        </button>
        <button
          type="button"
          className={`${styles.filterButton} ${typeFilter === 'corporate' ? styles.filterButtonActive : ''}`}
          onClick={() => setTypeFilter('corporate')}
        >
          Corporate ({corporateCount})
        </button>
      </div>

      {filtered.length === 0 ? (
        <div className={styles.emptyState}>
          <p>
            {search
              ? `No clients matching "${search}".`
              : `No ${typeFilter === 'all' ? '' : typeFilter} clients found.`}
          </p>
        </div>
      ) : (
        <table className={styles.table}>
          <thead>
            <tr>
              <th>Name</th>
              <th>Type</th>
              <th>Created</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((client) => (
              <tr key={client.id}>
                <td>
                  <Link
                    href={`/clients/${client.id}`}
                    className={styles.tableLink}
                  >
                    {client.name}
                  </Link>
                </td>
                <td>
                  <span
                    className={`${styles.badge} ${
                      client.client_type === 'individual'
                        ? styles.badgeIndividual
                        : styles.badgeCorporate
                    }`}
                  >
                    {client.client_type}
                  </span>
                </td>
                <td>{formatDate(client.created_at)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </>
  );
}
