'use client';

/**
 * Export as PDF Button
 *
 * Triggers window.print() which the user can save as PDF.
 * Dispatches beforeprint/afterprint events that CompaniesHouseCard
 * and AssessmentDetail listen to for auto-expand.
 */

import styles from './page.module.css';

export function ExportPdfButton() {
  return (
    <button
      type="button"
      className={styles.exportPdfButton}
      onClick={() => window.print()}
    >
      Export as PDF
    </button>
  );
}
