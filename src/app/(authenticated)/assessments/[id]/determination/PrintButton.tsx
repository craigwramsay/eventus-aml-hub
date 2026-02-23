'use client';

/**
 * Print Button Component
 *
 * Triggers browser print dialog for PDF export.
 */

import styles from './page.module.css';

export function PrintButton() {
  return (
    <button
      className={styles.printButton}
      onClick={() => window.print()}
      aria-label="Print or save as PDF"
    >
      <span>&#128438;</span>
      <span>Print / PDF</span>
    </button>
  );
}
