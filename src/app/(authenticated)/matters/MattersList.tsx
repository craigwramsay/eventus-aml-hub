'use client';

/**
 * Matters List with client-side search, pill filters, and sortable table
 */

import { useState } from 'react';
import Link from 'next/link';
import type { MatterWithClient } from '@/app/actions/matters';
import { SortableTable, type ColumnConfig } from '@/components/tables/SortableTable';
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

  const columns: ColumnConfig<MatterWithClient>[] = [
    {
      key: 'matter',
      label: 'Matter',
      sortable: true,
      sortValue: (row) => (row.description || row.reference).toLowerCase(),
      render: (row) => (
        <Link href={`/matters/${row.id}`} className={styles.tableLink}>
          {row.description || row.reference}
        </Link>
      ),
    },
    {
      key: 'client',
      label: 'Client',
      sortable: true,
      sortValue: (row) => row.client.name.toLowerCase(),
      render: (row) => (
        <Link href={`/clients/${row.client.id}`} className={styles.tableLink}>
          {row.client.name}
        </Link>
      ),
    },
    {
      key: 'status',
      label: 'Status',
      sortable: true,
      sortValue: (row) => row.status,
      render: (row) => (
        <span
          className={`${styles.badge} ${
            row.status === 'open' ? styles.badgeOpen : styles.badgeClosed
          }`}
        >
          {row.status}
        </span>
      ),
    },
    {
      key: 'created',
      label: 'Created',
      sortable: true,
      sortValue: (row) => row.created_at,
      render: (row) => formatDate(row.created_at),
    },
  ];

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

      <SortableTable
        columns={columns}
        data={filtered}
        rowKey={(row) => row.id}
        emptyMessage={
          search
            ? `No matters matching "${search}".`
            : `No ${statusFilter === 'all' ? '' : statusFilter} matters found.`
        }
      />
    </>
  );
}
