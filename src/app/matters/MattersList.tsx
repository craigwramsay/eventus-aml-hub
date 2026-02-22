'use client';

/**
 * Matters List with client-side search and status filtering
 */

import { useState } from 'react';
import Link from 'next/link';
import type { MatterWithClient } from '@/app/actions/matters';
import styles from './matters.module.css';

type StatusFilter = 'all' | 'open' | 'closed';

interface MattersListProps {
  matters: MatterWithClient[];
}

function formatDate(dateString: string): string {
  return new Date(dateString).toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

export function MattersList({ matters }: MattersListProps) {
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');

  const filtered = matters.filter((matter) => {
    if (statusFilter !== 'all' && matter.status !== statusFilter) return false;
    if (search) {
      const term = search.toLowerCase();
      return (
        matter.reference.toLowerCase().includes(term) ||
        matter.client.name.toLowerCase().includes(term) ||
        (matter.description && matter.description.toLowerCase().includes(term))
      );
    }
    return true;
  });

  const openCount = matters.filter((m) => m.status === 'open').length;
  const closedCount = matters.filter((m) => m.status === 'closed').length;

  return (
    <>
      <div className={styles.searchBar}>
        <input
          type="text"
          className={styles.searchInput}
          placeholder="Search matters..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      <div className={styles.filters}>
        <button
          type="button"
          className={`${styles.filterButton} ${statusFilter === 'all' ? styles.filterButtonActive : ''}`}
          onClick={() => setStatusFilter('all')}
        >
          All ({matters.length})
        </button>
        <button
          type="button"
          className={`${styles.filterButton} ${statusFilter === 'open' ? styles.filterButtonActive : ''}`}
          onClick={() => setStatusFilter('open')}
        >
          Open ({openCount})
        </button>
        <button
          type="button"
          className={`${styles.filterButton} ${statusFilter === 'closed' ? styles.filterButtonActive : ''}`}
          onClick={() => setStatusFilter('closed')}
        >
          Closed ({closedCount})
        </button>
      </div>

      {filtered.length === 0 ? (
        <div className={styles.emptyState}>
          <p>
            {search
              ? `No matters matching "${search}".`
              : `No ${statusFilter === 'all' ? '' : statusFilter} matters found.`}
          </p>
        </div>
      ) : (
        <table className={styles.table}>
          <thead>
            <tr>
              <th>Reference</th>
              <th>Client</th>
              <th>Status</th>
              <th>Created</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((matter) => (
              <tr key={matter.id}>
                <td>
                  <Link
                    href={`/matters/${matter.id}`}
                    className={styles.tableLink}
                  >
                    {matter.reference}
                  </Link>
                </td>
                <td>
                  <Link
                    href={`/clients/${matter.client.id}`}
                    className={styles.tableLink}
                  >
                    {matter.client.name}
                  </Link>
                </td>
                <td>
                  <span
                    className={`${styles.badge} ${
                      matter.status === 'open'
                        ? styles.badgeOpen
                        : styles.badgeClosed
                    }`}
                  >
                    {matter.status}
                  </span>
                </td>
                <td>{formatDate(matter.created_at)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </>
  );
}
