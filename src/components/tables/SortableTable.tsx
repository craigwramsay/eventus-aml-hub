'use client';

import { useState, useMemo, type ReactNode } from 'react';
import styles from './sortableTable.module.css';

export interface ColumnConfig<T> {
  key: string;
  label: string;
  sortable?: boolean;
  filterable?: boolean;
  filterType?: 'select';
  filterOptions?: { label: string; value: string }[];
  /** Return the raw sortable value for this column */
  sortValue?: (row: T) => string | number;
  /** Return the display ReactNode for this column */
  render: (row: T) => ReactNode;
}

type SortDirection = 'asc' | 'desc' | null;

interface SortableTableProps<T> {
  columns: ColumnConfig<T>[];
  data: T[];
  rowKey: (row: T) => string;
  emptyMessage?: string;
}

export function SortableTable<T>({
  columns,
  data,
  rowKey,
  emptyMessage = 'No results found.',
}: SortableTableProps<T>) {
  const [sortKey, setSortKey] = useState<string | null>(null);
  const [sortDir, setSortDir] = useState<SortDirection>(null);
  const [columnFilters, setColumnFilters] = useState<Record<string, string>>({});

  const hasAnyFilter = columns.some((c) => c.filterable);

  function handleSort(key: string) {
    if (sortKey === key) {
      if (sortDir === 'asc') setSortDir('desc');
      else if (sortDir === 'desc') {
        setSortKey(null);
        setSortDir(null);
      }
    } else {
      setSortKey(key);
      setSortDir('asc');
    }
  }

  function handleFilterChange(key: string, value: string) {
    setColumnFilters((prev) => ({ ...prev, [key]: value }));
  }

  const processed = useMemo(() => {
    let rows = [...data];

    // Apply column filters
    for (const col of columns) {
      const filterVal = columnFilters[col.key];
      if (!filterVal || !col.filterable || !col.filterOptions) continue;
      rows = rows.filter((row) => {
        const sortVal = col.sortValue ? col.sortValue(row) : '';
        return String(sortVal) === filterVal;
      });
    }

    // Apply sort
    if (sortKey && sortDir) {
      const col = columns.find((c) => c.key === sortKey);
      if (col?.sortValue) {
        rows.sort((a, b) => {
          const aVal = col.sortValue!(a);
          const bVal = col.sortValue!(b);
          if (aVal < bVal) return sortDir === 'asc' ? -1 : 1;
          if (aVal > bVal) return sortDir === 'asc' ? 1 : -1;
          return 0;
        });
      }
    }

    return rows;
  }, [data, columns, columnFilters, sortKey, sortDir]);

  function renderSortArrow(key: string) {
    if (sortKey !== key || !sortDir) {
      return <span className={styles.sortArrow}>{'\u2195'}</span>;
    }
    return (
      <span className={`${styles.sortArrow} ${styles.sortArrowActive}`}>
        {sortDir === 'asc' ? '\u2191' : '\u2193'}
      </span>
    );
  }

  if (processed.length === 0 && data.length === 0) {
    return (
      <div className={styles.emptyState}>
        <p>{emptyMessage}</p>
      </div>
    );
  }

  return (
    <table className={styles.table}>
      <thead>
        <tr>
          {columns.map((col) => (
            <th
              key={col.key}
              className={col.sortable ? styles.sortableHeader : undefined}
              onClick={col.sortable ? () => handleSort(col.key) : undefined}
            >
              <span className={styles.headerContent}>
                {col.label}
                {col.sortable && renderSortArrow(col.key)}
              </span>
            </th>
          ))}
        </tr>
        {hasAnyFilter && (
          <tr className={styles.filterRow}>
            {columns.map((col) => (
              <th key={`filter-${col.key}`}>
                {col.filterable && col.filterType === 'select' && col.filterOptions ? (
                  <select
                    className={styles.columnFilter}
                    value={columnFilters[col.key] || ''}
                    onChange={(e) => handleFilterChange(col.key, e.target.value)}
                  >
                    <option value="">All</option>
                    {col.filterOptions.map((opt) => (
                      <option key={opt.value} value={opt.value}>
                        {opt.label}
                      </option>
                    ))}
                  </select>
                ) : null}
              </th>
            ))}
          </tr>
        )}
      </thead>
      <tbody>
        {processed.length === 0 ? (
          <tr>
            <td colSpan={columns.length} style={{ textAlign: 'center', padding: '2rem', color: 'var(--text-secondary)' }}>
              No matching results.
            </td>
          </tr>
        ) : (
          processed.map((row) => (
            <tr key={rowKey(row)}>
              {columns.map((col) => (
                <td key={col.key}>{col.render(row)}</td>
              ))}
            </tr>
          ))
        )}
      </tbody>
    </table>
  );
}
