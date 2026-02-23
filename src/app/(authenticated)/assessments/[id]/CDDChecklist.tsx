'use client';

/**
 * CDD Checklist
 *
 * Interactive checklist for CDD requirements. Each item renders as a card with:
 * - Checkbox to mark as complete (optimistic toggle)
 * - Per-item action buttons (CH lookup, Amiqus placeholder, form placeholder, attach evidence)
 * - Per-item evidence badge and inline evidence list
 * When finalised: all controls disabled, checkboxes display-only.
 */

import { useState, useTransition, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import type { MandatoryAction, EDDTriggerResult } from '@/lib/rules-engine/types';
import type { AssessmentEvidence, CddItemProgress } from '@/lib/supabase/types';
import { toggleItemCompletion } from '@/app/actions/progress';
import { uploadEvidence, addManualRecord, lookupCompaniesHouse } from '@/app/actions/evidence';
import { CompaniesHouseCard } from './CompaniesHouseCard';
import styles from './page.module.css';

/** Category display labels */
const CATEGORY_LABELS: Record<string, string> = {
  cdd: 'CUSTOMER DUE DILIGENCE',
  edd: 'ENHANCED DUE DILIGENCE',
  sow: 'SOURCE OF WEALTH',
  sof: 'SOURCE OF FUNDS',
  escalation: 'ESCALATION',
};

const CATEGORY_ORDER = ['cdd', 'edd', 'sow', 'sof', 'escalation'];

interface CDDChecklistProps {
  assessmentId: string;
  /** Non-EDD mandatory actions (excludes monitoring) */
  actions: MandatoryAction[];
  /** EDD actions (separate section) */
  eddActions: MandatoryAction[];
  /** EDD trigger descriptions */
  eddTriggers: EDDTriggerResult[];
  /** All evidence records for this assessment */
  evidence: AssessmentEvidence[];
  /** Progress records for CDD items */
  progress: CddItemProgress[];
  /** Whether the client is corporate (enables CH lookup) */
  isCorporate: boolean;
  /** Company number for CH lookups */
  registeredNumber: string | null;
  /** Whether the assessment is finalised (read-only mode) */
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

/** Check if an action should show a CH lookup button */
function isCompaniesHouseAction(action: MandatoryAction): boolean {
  return action.actionId === 'companies_house_search' ||
    (action.evidenceTypes?.includes('companies_house_report') ?? false);
}

/** Check if an action is identity verification (Amiqus placeholder) */
function isIdentityAction(action: MandatoryAction): boolean {
  return action.actionId.includes('identity_verification') ||
    action.actionId.includes('verify_identity') ||
    (action.evidenceTypes?.includes('identity_verification') ?? false);
}

/** Check if an action is a form action */
function isFormAction(action: MandatoryAction): boolean {
  return action.actionId === 'sow_form' || action.actionId === 'sof_form';
}

export function CDDChecklist({
  assessmentId,
  actions,
  eddActions,
  eddTriggers,
  evidence,
  progress,
  isCorporate,
  registeredNumber,
  isFinalised,
}: CDDChecklistProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  // Track which items have open evidence forms
  const [openUpload, setOpenUpload] = useState<string | null>(null);
  const [openManual, setOpenManual] = useState<string | null>(null);
  const [manualLabel, setManualLabel] = useState('');
  const [manualNotes, setManualNotes] = useState('');

  // Build a set of completed action IDs for optimistic UI
  const [optimisticCompleted, setOptimisticCompleted] = useState<Set<string>>(() => {
    const set = new Set<string>();
    for (const p of progress) {
      if (p.completed_at) set.add(p.action_id);
    }
    return set;
  });

  // Build evidence map: actionId -> evidence[]
  const evidenceByAction = new Map<string, AssessmentEvidence[]>();
  for (const e of evidence) {
    if (e.action_id) {
      const list = evidenceByAction.get(e.action_id) || [];
      list.push(e);
      evidenceByAction.set(e.action_id, list);
    }
  }

  const handleToggle = useCallback((actionId: string, currentlyCompleted: boolean) => {
    if (isFinalised) return;
    setError(null);

    // Optimistic update
    setOptimisticCompleted(prev => {
      const next = new Set(prev);
      if (currentlyCompleted) {
        next.delete(actionId);
      } else {
        next.add(actionId);
      }
      return next;
    });

    startTransition(async () => {
      const result = await toggleItemCompletion(assessmentId, actionId, !currentlyCompleted);
      if (!result.success) {
        // Revert optimistic update
        setOptimisticCompleted(prev => {
          const next = new Set(prev);
          if (currentlyCompleted) {
            next.add(actionId);
          } else {
            next.delete(actionId);
          }
          return next;
        });
        setError(result.error);
      }
    });
  }, [assessmentId, isFinalised, startTransition]);

  const handleCHLookup = useCallback((actionId: string) => {
    if (!registeredNumber) return;
    setError(null);

    startTransition(async () => {
      const result = await lookupCompaniesHouse(assessmentId, registeredNumber, actionId);
      if (!result.success) {
        setError(result.error);
      } else {
        router.refresh();
      }
    });
  }, [assessmentId, registeredNumber, router, startTransition]);

  const handleFileUpload = useCallback((actionId: string, e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError(null);

    const formData = new FormData(e.currentTarget);
    startTransition(async () => {
      const result = await uploadEvidence(assessmentId, formData, actionId);
      if (!result.success) {
        setError(result.error);
      } else {
        setOpenUpload(null);
        router.refresh();
      }
    });
  }, [assessmentId, router, startTransition]);

  const handleManualRecord = useCallback((actionId: string, e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError(null);

    startTransition(async () => {
      const result = await addManualRecord(assessmentId, manualLabel, manualNotes, actionId);
      if (!result.success) {
        setError(result.error);
      } else {
        setOpenManual(null);
        setManualLabel('');
        setManualNotes('');
        router.refresh();
      }
    });
  }, [assessmentId, manualLabel, manualNotes, router, startTransition]);

  // Group non-EDD actions by category (excluding monitoring)
  const groupedActions: Record<string, MandatoryAction[]> = {};
  for (const action of actions) {
    const cat = action.category || 'cdd';
    if (!groupedActions[cat]) groupedActions[cat] = [];
    groupedActions[cat].push(action);
  }

  const sortedCategories = Object.keys(groupedActions).sort((a, b) => {
    const ai = CATEGORY_ORDER.indexOf(a);
    const bi = CATEGORY_ORDER.indexOf(b);
    return (ai === -1 ? 999 : ai) - (bi === -1 ? 999 : bi);
  });

  function renderActionItem(action: MandatoryAction, num: number) {
    const isCompleted = optimisticCompleted.has(action.actionId);
    const itemEvidence = evidenceByAction.get(action.actionId) || [];
    const showCH = isCompaniesHouseAction(action) && isCorporate && registeredNumber;
    const showAmiqus = isIdentityAction(action);
    const showForm = isFormAction(action);

    return (
      <div
        key={action.actionId}
        className={`${styles.cddItemCard} ${isCompleted ? styles.cddItemCompleted : ''}`}
      >
        <div className={styles.cddItemHeader}>
          <label className={styles.cddItemCheckbox}>
            <input
              type="checkbox"
              checked={isCompleted}
              onChange={() => handleToggle(action.actionId, isCompleted)}
              disabled={isFinalised || isPending}
              className={styles.cddCheckboxInput}
            />
            <span className={styles.cddItemNumber}>{num}.</span>
            <span className={`${styles.cddItemText} ${isCompleted ? styles.cddItemTextDone : ''}`}>
              {action.displayText || action.description}
            </span>
          </label>
          <div className={styles.cddItemBadges}>
            {action.priority === 'recommended' && (
              <span className={styles.recommendedBadge}>[Recommended]</span>
            )}
            {itemEvidence.length > 0 && (
              <span className={styles.evidenceCountBadge}>
                {itemEvidence.length} evidence
              </span>
            )}
          </div>
        </div>

        {/* Per-item evidence list */}
        {itemEvidence.length > 0 && (
          <div className={styles.cddItemEvidence}>
            {itemEvidence.map((ev) => {
              if (ev.evidence_type === 'companies_house') {
                return <CompaniesHouseCard key={ev.id} evidence={ev} />;
              }
              return (
                <div key={ev.id} className={styles.cddEvidenceRow}>
                  <span
                    className={
                      ev.evidence_type === 'file_upload'
                        ? styles.evidenceBadgeFile
                        : styles.evidenceBadgeManual
                    }
                  >
                    {ev.evidence_type === 'file_upload' ? 'File' : 'Record'}
                  </span>
                  <span className={styles.evidenceLabel}>{ev.label}</span>
                  {ev.file_size && (
                    <span className={styles.evidenceFileSize}>
                      {formatFileSize(ev.file_size)}
                    </span>
                  )}
                  <span className={styles.evidenceMeta}>
                    {formatDate(ev.created_at)}
                  </span>
                </div>
              );
            })}
          </div>
        )}

        {/* Action buttons */}
        {!isFinalised && (
          <div className={styles.cddItemActions}>
            {showCH && (
              <button
                type="button"
                className={styles.chLookupButton}
                onClick={() => handleCHLookup(action.actionId)}
                disabled={isPending}
              >
                {isPending ? 'Looking up...' : 'Verify at Companies House'}
              </button>
            )}
            {showAmiqus && (
              <button
                type="button"
                className={styles.evidenceActionButton}
                disabled
                title="Coming soon"
              >
                Verify via Amiqus
              </button>
            )}
            {showForm && (
              <button
                type="button"
                className={styles.evidenceActionButton}
                disabled
                title="Coming soon"
              >
                Open Form
              </button>
            )}
            <button
              type="button"
              className={styles.evidenceActionButton}
              onClick={() => {
                setOpenUpload(openUpload === action.actionId ? null : action.actionId);
                setOpenManual(null);
              }}
              disabled={isPending}
            >
              Upload Evidence
            </button>
            <button
              type="button"
              className={styles.evidenceActionButton}
              onClick={() => {
                setOpenManual(openManual === action.actionId ? null : action.actionId);
                setOpenUpload(null);
              }}
              disabled={isPending}
            >
              Add Record
            </button>
          </div>
        )}

        {/* Inline upload form */}
        {openUpload === action.actionId && (
          <form
            onSubmit={(e) => handleFileUpload(action.actionId, e)}
            className={styles.evidenceForm}
          >
            <div className={styles.formField}>
              <label htmlFor={`file-${action.actionId}`} className={styles.formLabel}>File</label>
              <input
                id={`file-${action.actionId}`}
                type="file"
                name="file"
                required
                className={styles.formInput}
              />
            </div>
            <div className={styles.formField}>
              <label htmlFor={`notes-${action.actionId}`} className={styles.formLabel}>
                Notes (optional)
              </label>
              <textarea
                id={`notes-${action.actionId}`}
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

        {/* Inline manual record form */}
        {openManual === action.actionId && (
          <form
            onSubmit={(e) => handleManualRecord(action.actionId, e)}
            className={styles.evidenceForm}
          >
            <div className={styles.formField}>
              <label htmlFor={`manual-label-${action.actionId}`} className={styles.formLabel}>
                Label
              </label>
              <input
                id={`manual-label-${action.actionId}`}
                type="text"
                value={manualLabel}
                onChange={(e) => setManualLabel(e.target.value)}
                required
                placeholder="e.g. Passport verified in person"
                className={styles.formInput}
              />
            </div>
            <div className={styles.formField}>
              <label htmlFor={`manual-notes-${action.actionId}`} className={styles.formLabel}>
                Notes
              </label>
              <textarea
                id={`manual-notes-${action.actionId}`}
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
      </div>
    );
  }

  let num = 0;

  return (
    <>
      {error && <div className={styles.evidenceError}>{error}</div>}

      {/* Non-EDD action groups */}
      <section className={styles.section}>
        <h2 className={styles.sectionTitle}>CDD Requirements</h2>
        {sortedCategories.map((category) => (
          <div key={category} className={styles.cddCategory}>
            <h3 className={styles.cddCategoryLabel}>
              {CATEGORY_LABELS[category] || category.toUpperCase()}
            </h3>
            {groupedActions[category].map((action) => {
              num++;
              return renderActionItem(action, num);
            })}
          </div>
        ))}
      </section>

      {/* EDD section */}
      {eddActions.length > 0 && (
        <section className={`${styles.section} ${styles.eddSection}`}>
          <h2 className={styles.sectionTitle}>Enhanced Due Diligence</h2>
          {eddTriggers.length > 0 && (
            <div className={styles.eddTriggerNote}>
              These requirements apply due to:
              <ul className={styles.eddTriggerList}>
                {eddTriggers.map((trigger) => (
                  <li key={trigger.triggerId}>{trigger.description}</li>
                ))}
              </ul>
            </div>
          )}
          {eddActions.map((action) => {
            num++;
            return renderActionItem(action, num);
          })}
        </section>
      )}
    </>
  );
}
