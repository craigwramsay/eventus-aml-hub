'use client';

/**
 * Evidence Section
 *
 * Displays existing evidence records and provides actions to add more:
 * - Upload file evidence
 * - Add manual record
 * - Trigger Companies House lookup (for corporate clients)
 */

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import type { AssessmentEvidence } from '@/lib/supabase/types';
import { uploadEvidence, addManualRecord, lookupCompaniesHouse } from '@/app/actions/evidence';
import { CompaniesHouseCard } from './CompaniesHouseCard';
import styles from './page.module.css';

interface EvidenceSectionProps {
  assessmentId: string;
  evidence: AssessmentEvidence[];
  registeredNumber: string | null;
  isCorporate: boolean;
  isFinalised: boolean;
}

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function EvidenceSection({
  assessmentId,
  evidence,
  registeredNumber,
  isCorporate,
  isFinalised,
}: EvidenceSectionProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [showUpload, setShowUpload] = useState(false);
  const [showManual, setShowManual] = useState(false);
  const [manualLabel, setManualLabel] = useState('');
  const [manualNotes, setManualNotes] = useState('');

  async function handleCHLookup() {
    if (!registeredNumber) return;
    setError(null);

    startTransition(async () => {
      const result = await lookupCompaniesHouse(assessmentId, registeredNumber);
      if (!result.success) {
        setError(result.error);
      } else {
        router.refresh();
      }
    });
  }

  async function handleFileUpload(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);

    const formData = new FormData(e.currentTarget);
    startTransition(async () => {
      const result = await uploadEvidence(assessmentId, formData);
      if (!result.success) {
        setError(result.error);
      } else {
        setShowUpload(false);
        router.refresh();
      }
    });
  }

  async function handleManualRecord(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);

    startTransition(async () => {
      const result = await addManualRecord(assessmentId, manualLabel, manualNotes);
      if (!result.success) {
        setError(result.error);
      } else {
        setShowManual(false);
        setManualLabel('');
        setManualNotes('');
        router.refresh();
      }
    });
  }

  // Filter to assessment-level evidence only (action_id is null)
  // Per-item evidence now lives inside CDDChecklist
  const assessmentEvidence = evidence.filter((e) => !e.action_id);

  return (
    <section className={styles.section}>
      <h2 className={styles.sectionTitle}>General Evidence</h2>

      {error && <div className={styles.evidenceError}>{error}</div>}

      {/* Evidence list */}
      {assessmentEvidence.length === 0 ? (
        <p className={styles.evidenceEmpty}>No general evidence records yet. Per-item evidence is shown in the CDD checklist above.</p>
      ) : (
        <div className={styles.evidenceList}>
          {assessmentEvidence.map((item) => {
            if (item.evidence_type === 'companies_house') {
              return <CompaniesHouseCard key={item.id} evidence={item} />;
            }

            return (
              <div key={item.id} className={styles.evidenceCard}>
                <div className={styles.evidenceCardHeader}>
                  <span
                    className={
                      item.evidence_type === 'file_upload'
                        ? styles.evidenceBadgeFile
                        : styles.evidenceBadgeManual
                    }
                  >
                    {item.evidence_type === 'file_upload' ? 'File' : 'Record'}
                  </span>
                  <span className={styles.evidenceLabel}>{item.label}</span>
                  {item.file_size && (
                    <span className={styles.evidenceFileSize}>
                      {formatFileSize(item.file_size)}
                    </span>
                  )}
                </div>
                {item.notes && (
                  <div className={styles.evidenceNotes}>{item.notes}</div>
                )}
                <div className={styles.evidenceMeta}>
                  Added {formatDate(item.created_at)}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Action buttons */}
      {!isFinalised && (
        <div className={styles.evidenceActions}>
          {isCorporate && registeredNumber && (
            <button
              type="button"
              className={styles.chLookupButton}
              onClick={handleCHLookup}
              disabled={isPending}
            >
              {isPending ? 'Looking up...' : 'Verify at Companies House'}
            </button>
          )}

          <button
            type="button"
            className={styles.evidenceActionButton}
            onClick={() => { setShowUpload(!showUpload); setShowManual(false); }}
            disabled={isPending}
          >
            Upload Evidence
          </button>

          <button
            type="button"
            className={styles.evidenceActionButton}
            onClick={() => { setShowManual(!showManual); setShowUpload(false); }}
            disabled={isPending}
          >
            Add Manual Record
          </button>
        </div>
      )}

      {/* Upload form */}
      {showUpload && (
        <form onSubmit={handleFileUpload} className={styles.evidenceForm}>
          <div className={styles.formField}>
            <label htmlFor="evidence-file" className={styles.formLabel}>File</label>
            <input
              id="evidence-file"
              type="file"
              name="file"
              required
              className={styles.formInput}
            />
          </div>
          <div className={styles.formField}>
            <label htmlFor="evidence-notes" className={styles.formLabel}>Notes (optional)</label>
            <textarea
              id="evidence-notes"
              name="notes"
              rows={2}
              className={styles.formTextarea}
            />
          </div>
          <button type="submit" disabled={isPending} className={styles.formSubmit}>
            {isPending ? 'Uploading...' : 'Upload'}
          </button>
        </form>
      )}

      {/* Manual record form */}
      {showManual && (
        <form onSubmit={handleManualRecord} className={styles.evidenceForm}>
          <div className={styles.formField}>
            <label htmlFor="manual-label" className={styles.formLabel}>Label</label>
            <input
              id="manual-label"
              type="text"
              value={manualLabel}
              onChange={(e) => setManualLabel(e.target.value)}
              required
              placeholder="e.g. Passport verified in person"
              className={styles.formInput}
            />
          </div>
          <div className={styles.formField}>
            <label htmlFor="manual-notes" className={styles.formLabel}>Notes</label>
            <textarea
              id="manual-notes"
              value={manualNotes}
              onChange={(e) => setManualNotes(e.target.value)}
              rows={2}
              placeholder="Additional details..."
              className={styles.formTextarea}
            />
          </div>
          <button type="submit" disabled={isPending} className={styles.formSubmit}>
            {isPending ? 'Saving...' : 'Save Record'}
          </button>
        </form>
      )}
    </section>
  );
}
