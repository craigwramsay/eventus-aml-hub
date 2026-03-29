'use client';

/**
 * Export as PDF Button
 *
 * Calls a server action that generates the same PDF as Clio Drive,
 * then triggers a client-side download.
 */

import { useState, useTransition } from 'react';
import { exportAssessmentPdf } from '@/app/actions/export-pdf';
import styles from './page.module.css';

interface ExportPdfButtonProps {
  assessmentId: string;
}

export function ExportPdfButton({ assessmentId }: ExportPdfButtonProps) {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const handleExport = () => {
    setError(null);
    startTransition(async () => {
      const result = await exportAssessmentPdf(assessmentId);
      if (!result.success) {
        setError(result.error);
        return;
      }

      // Convert base64 to blob and trigger download
      const byteArray = Uint8Array.from(atob(result.pdfBase64), c => c.charCodeAt(0));
      const blob = new Blob([byteArray], { type: 'application/pdf' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = result.fileName;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    });
  };

  return (
    <>
      <button
        type="button"
        className={styles.exportPdfButton}
        onClick={handleExport}
        disabled={isPending}
      >
        {isPending ? 'Generating PDF...' : 'Export as PDF'}
      </button>
      {error && <span style={{ color: 'var(--status-high)', fontSize: '0.8125rem', marginLeft: '0.5rem' }}>{error}</span>}
    </>
  );
}
