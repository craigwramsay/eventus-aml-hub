'use client';

/**
 * Clients List with client-side search, pill filters, and sortable table
 */

import { useState } from 'react';
import Link from 'next/link';
import type { Client } from '@/lib/supabase/types';
import { SortableTable, type ColumnConfig } from '@/components/tables/SortableTable';
import { InlineDeleteButton } from '@/components/tables/InlineDeleteButton';
import { deleteClient } from '@/app/actions/clients';
import styles from './clients.module.css';

type TypeFilter = 'all' | 'individual' | 'corporate';

interface ClientsListProps {
  clients: Client[];
  canDelete?: boolean;
}

function formatDate(dateString: string): string {
  return new Date(dateString).toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

export function ClientsList({ clients, canDelete }: ClientsListProps) {
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

  const columns: ColumnConfig<Client>[] = [
    {
      key: 'name',
      label: 'Name',
      sortable: true,
      sortValue: (row) => row.name.toLowerCase(),
      render: (row) => (
        <Link href={`/clients/${row.id}`} className={styles.tableLink}>
          {row.name}
        </Link>
      ),
    },
    {
      key: 'type',
      label: 'Type',
      sortable: true,
      sortValue: (row) => row.client_type,
      render: (row) => (
        <span
          className={`${styles.badge} ${
            row.client_type === 'individual'
              ? styles.badgeIndividual
              : styles.badgeCorporate
          }`}
        >
          {row.client_type.charAt(0).toUpperCase() + row.client_type.slice(1)}
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
    ...(canDelete
      ? [
          {
            key: 'actions',
            label: '',
            render: (row: Client) => (
              <InlineDeleteButton
                label="Delete"
                confirmMessage={`Delete ${row.name}?`}
                onDelete={() => deleteClient(row.id)}
              />
            ),
          },
        ]
      : []),
  ];

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

      <SortableTable
        columns={columns}
        data={filtered}
        rowKey={(row) => row.id}
        emptyMessage={
          search
            ? `No clients matching "${search}".`
            : `No ${typeFilter === 'all' ? '' : typeFilter} clients found.`
        }
      />
    </>
  );
}
