'use client';

/**
 * Assessments List with client-side filtering
 */

import { useState } from 'react';
import Link from 'next/link';
import type { AssessmentListItem } from '@/app/actions/assessments';
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
  const [filter, setFilter] = useState<FilterStatus>('all');

  const filtered = assessments.filter((a) => {
    if (filter === 'draft') return a.finalised_at === null;
    if (filter === 'finalised') return a.finalised_at !== null;
    return true;
  });

  const draftCount = assessments.filter((a) => a.finalised_at === null).length;
  const finalisedCount = assessments.filter((a) => a.finalised_at !== null).length;

  return (
    <>
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

      {filtered.length === 0 ? (
        <div className={styles.emptyState}>
          <p>No {filter === 'all' ? '' : filter} assessments found.</p>
        </div>
      ) : (
        <table className={styles.table}>
          <thead>
            <tr>
              <th>Client</th>
              <th>Matter</th>
              <th>Risk</th>
              <th>Status</th>
              <th>Date</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((assessment) => (
              <tr key={assessment.id}>
                <td>
                  <Link
                    href={`/assessments/${assessment.id}`}
                    className={styles.tableLink}
                  >
                    {assessment.client_name}
                  </Link>
                </td>
                <td>
                  {assessment.matter_description || assessment.matter_reference}
                  {assessment.matter_description && (
                    <span className={styles.matterRef}>
                      {' '}({assessment.matter_reference})
                    </span>
                  )}
                </td>
                <td>
                  <span className={`${styles.riskBadge} ${getRiskClass(assessment.risk_level)}`}>
                    {getRiskLabel(assessment.risk_level)}
                  </span>
                </td>
                <td>
                  <span
                    className={`${styles.statusBadge} ${
                      assessment.finalised_at ? styles.statusFinalised : styles.statusDraft
                    }`}
                  >
                    {assessment.finalised_at ? 'Finalised' : 'Draft'}
                  </span>
                </td>
                <td>{formatDate(assessment.created_at)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </>
  );
}
