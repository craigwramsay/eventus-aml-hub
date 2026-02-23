'use client';

/**
 * Assessments List with client-side search, pill filters, and sortable table
 */

import { useState } from 'react';
import Link from 'next/link';
import type { AssessmentListItem } from '@/app/actions/assessments';
import { SortableTable, type ColumnConfig } from '@/components/tables/SortableTable';
import styles from './assessments.module.css';

type FilterStatus = 'all' | 'draft' | 'finalised';

interface AssessmentsListProps {
  assessments: AssessmentListItem[];
}

function formatDate(dateString: string): string {
  return new Date(dateString).toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

function getRiskClass(level: string): string {
  switch (level) {
    case 'LOW': return styles.riskLow;
    case 'MEDIUM': return styles.riskMedium;
    case 'HIGH': return styles.riskHigh;
    default: return '';
  }
}

function getRiskLabel(level: string): string {
  switch (level) {
    case 'LOW': return 'Low';
    case 'MEDIUM': return 'Medium';
    case 'HIGH': return 'High';
    default: return level;
  }
}

export function AssessmentsList({ assessments }: AssessmentsListProps) {
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<FilterStatus>('all');

  const filtered = assessments.filter((a) => {
    if (filter === 'draft' && a.finalised_at !== null) return false;
    if (filter === 'finalised' && a.finalised_at === null) return false;
    if (search) {
      const term = search.toLowerCase();
      return (
        a.client_name.toLowerCase().includes(term) ||
        a.reference.toLowerCase().includes(term) ||
        a.matter_reference.toLowerCase().includes(term) ||
        (a.matter_description && a.matter_description.toLowerCase().includes(term))
      );
    }
    return true;
  });

  const draftCount = assessments.filter((a) => a.finalised_at === null).length;
  const finalisedCount = assessments.filter((a) => a.finalised_at !== null).length;

  const columns: ColumnConfig<AssessmentListItem>[] = [
    {
      key: 'client',
      label: 'Client',
      sortable: true,
      sortValue: (row) => row.client_name.toLowerCase(),
      render: (row) => (
        <Link href={`/assessments/${row.id}`} className={styles.tableLink}>
          {row.client_name}
        </Link>
      ),
    },
    {
      key: 'matter',
      label: 'Matter',
      sortable: true,
      sortValue: (row) => (row.matter_description || row.matter_reference).toLowerCase(),
      render: (row) => (
        <Link href={`/matters/${row.matter_id}`} className={styles.tableLink}>
          {row.matter_description || row.matter_reference}
        </Link>
      ),
    },
    {
      key: 'reference',
      label: 'Reference',
      sortable: true,
      sortValue: (row) => row.reference,
      render: (row) => (
        <Link href={`/assessments/${row.id}`} className={styles.tableLink}>
          {row.reference}
        </Link>
      ),
    },
    {
      key: 'risk',
      label: 'Risk',
      sortable: true,
      filterable: true,
      filterType: 'select',
      filterOptions: [
        { label: 'Low', value: 'LOW' },
        { label: 'Medium', value: 'MEDIUM' },
        { label: 'High', value: 'HIGH' },
      ],
      sortValue: (row) => row.risk_level,
      render: (row) => (
        <span className={`${styles.riskBadge} ${getRiskClass(row.risk_level)}`}>
          {getRiskLabel(row.risk_level)}
        </span>
      ),
    },
    {
      key: 'status',
      label: 'Status',
      sortable: true,
      sortValue: (row) => (row.finalised_at ? 'finalised' : 'draft'),
      render: (row) => (
        <span
          className={`${styles.statusBadge} ${
            row.finalised_at ? styles.statusFinalised : styles.statusDraft
          }`}
        >
          {row.finalised_at ? 'Finalised' : 'Draft'}
        </span>
      ),
    },
    {
      key: 'date',
      label: 'Date',
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
          placeholder="Search assessments..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      <div className={styles.filters}>
        <button
          type="button"
          className={`${styles.filterButton} ${filter === 'all' ? styles.filterButtonActive : ''}`}
          onClick={() => setFilter('all')}
        >
          All ({assessments.length})
        </button>
        <button
          type="button"
          className={`${styles.filterButton} ${filter === 'draft' ? styles.filterButtonActive : ''}`}
          onClick={() => setFilter('draft')}
        >
          Draft ({draftCount})
        </button>
        <button
          type="button"
          className={`${styles.filterButton} ${filter === 'finalised' ? styles.filterButtonActive : ''}`}
          onClick={() => setFilter('finalised')}
        >
          Finalised ({finalisedCount})
        </button>
      </div>

      <SortableTable
        columns={columns}
        data={filtered}
        rowKey={(row) => row.id}
        emptyMessage={`No ${filter === 'all' ? '' : filter} assessments found.`}
      />
    </>
  );
}
