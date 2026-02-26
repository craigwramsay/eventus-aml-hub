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
import type { AssessmentEvidence, CddItemProgress, AmiqusVerification } from '@/lib/supabase/types';
import { toggleItemCompletion } from '@/app/actions/progress';
import { uploadEvidence, addManualRecord, lookupCompaniesHouse } from '@/app/actions/evidence';
import { requestMLROApproval, withdrawApproval, decideApproval } from '@/app/actions/approvals';
import { initiateAmiqusVerification } from '@/app/actions/amiqus';
import { getSowSofFormConfig } from '@/lib/rules-engine/config-loader';
import { CompaniesHouseCard } from './CompaniesHouseCard';
import { SowSofForm } from './SowSofForm';
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
  /** MLRO approval status for this assessment */
  approvalStatus?: {
    id: string;
    status: 'pending' | 'approved' | 'rejected' | 'withdrawn';
    requested_at: string;
    decision_by_name?: string | null;
    decision_at?: string | null;
    decision_notes?: string | null;
  } | null;
  /** Current user's role */
  userRole?: string;
  /** Matter description from input snapshot (for confirm_matter_purpose) */
  matterDescription?: string;
  /** Amiqus verification records for this assessment */
  amiqusVerifications?: AmiqusVerification[];
  /** Whether Amiqus API is configured */
  amiqusConfigured?: boolean;
  /** Client name (for Amiqus initiation) */
  clientName?: string;
  /** Client email (for Amiqus initiation) */
  clientEmail?: string;
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
    action.actionId.includes('identify_and_verify') ||
    (action.evidenceTypes?.includes('identity_verification') ?? false);
}

/** Check if an action is a form action */
function isFormAction(action: MandatoryAction): boolean {
  return action.actionId === 'sow_form' || action.actionId === 'sof_form';
}

/** Check if an action is a confirmation-only action (no evidence needed) */
function isConfirmAction(action: MandatoryAction): boolean {
  return action.actionId === 'confirm_matter_purpose' ||
    action.actionId === 'verify_consistency' ||
    action.actionId === 'confirm_transparency' ||
    action.actionId === 'confirm_bo';
}

/** Check if an action is an MLRO approval action */
function isApprovalAction(action: MandatoryAction): boolean {
  return action.actionId === 'senior_management_approval' || action.actionId === 'mlro_approval';
}

/** Renders a saved SoW/SoF declaration as an expandable card */
function DeclarationCard({ evidence }: { evidence: AssessmentEvidence }) {
  const [expanded, setExpanded] = useState(false);
  const data = evidence.data as Record<string, string | string[]> | null;

  return (
    <div className={styles.evidenceCard}>
      <button
        type="button"
        className={styles.evidenceCardHeader}
        onClick={() => setExpanded(!expanded)}
        aria-expanded={expanded}
      >
        <span className={styles.evidenceBadgeManual}>Declaration</span>
        <span className={styles.evidenceLabel}>{evidence.label}</span>
        <span className={styles.evidenceMeta}>{formatDate(evidence.created_at)}</span>
        <span className={styles.expandIcon}>{expanded ? '\u25B2' : '\u25BC'}</span>
      </button>
      {expanded && data && (
        <div className={styles.evidenceCardBody}>
          <div className={styles.chGrid}>
            {Object.entries(data).map(([key, value]) => (
              <div key={key} className={styles.chField}>
                <span className={styles.chFieldLabel}>{key}</span>
                <span>{Array.isArray(value) ? value.join(', ') : String(value)}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

/**
 * Render a verification note with numbered items on separate lines.
 * Splits "Approved verification methods: (1) ... (2) ..." into a heading
 * followed by numbered items on their own lines.
 */
function renderVerificationNote(note: string): React.ReactNode {
  // Match pattern: "prefix: (1) item1, or (2) item2. Authority: ..."
  const match = note.match(/^(.+?):\s*(\(1\).+)$/);
  if (!match) return note;

  const heading = match[1].trim();
  let body = match[2];

  // Extract authority FIRST (before splitting) to avoid splitting on e.g. "28(4)"
  let authority = '';
  const authMatch = body.match(/\.\s*(Authority:.+)$/);
  if (authMatch) {
    authority = authMatch[1];
    body = body.replace(/\.\s*Authority:.+$/, '.');
  }

  // Now split on numbered list items: only match (N) preceded by start or ", or "
  // This avoids splitting on parenthesized numbers within text like "reg. 28(4)"
  const items: string[] = [];
  const itemRegex = /\((\d+)\)\s*/g;
  let lastIndex = 0;
  let m: RegExpExecArray | null;
  const starts: number[] = [];

  while ((m = itemRegex.exec(body)) !== null) {
    // Only treat as a list item if (N) is at the very start or preceded by whitespace/", or "
    if (m.index === 0 || /[\s,]$/.test(body.slice(0, m.index))) {
      starts.push(m.index);
    }
  }

  for (let i = 0; i < starts.length; i++) {
    const end = i + 1 < starts.length ? starts[i + 1] : body.length;
    const segment = body.slice(starts[i], end).trim();
    // Clean trailing ", or" from item
    items.push(segment.replace(/,\s*or\s*$/, ''));
  }

  if (items.length === 0) {
    // Fallback: couldn't parse items, render as-is
    return note;
  }

  return (
    <>
      <div>{heading}:</div>
      {items.map((item, i) => (
        <div key={i} style={{ marginTop: '0.25rem', paddingLeft: '0.75rem' }}>
          {item}
        </div>
      ))}
      {authority && (
        <div style={{ marginTop: '0.375rem', fontSize: '0.75rem', fontStyle: 'italic' }}>
          {authority}
        </div>
      )}
    </>
  );
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
  approvalStatus,
  userRole,
  matterDescription,
  amiqusVerifications = [],
  amiqusConfigured = false,
  clientName = '',
  clientEmail = '',
}: CDDChecklistProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  // Track which items have open evidence forms
  const [openUpload, setOpenUpload] = useState<string | null>(null);
  const [openManual, setOpenManual] = useState<string | null>(null);
  const [openForm, setOpenForm] = useState<string | null>(null);
  const [manualLabel, setManualLabel] = useState('');
  const [manualNotes, setManualNotes] = useState('');
  const [verifiedAt, setVerifiedAt] = useState('');
  const [approvalNotes, setApprovalNotes] = useState('');

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
        setVerifiedAt('');
        router.refresh();
      }
    });
  }, [assessmentId, router, startTransition]);

  const handleManualRecord = useCallback((actionId: string, isIdentity: boolean, e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError(null);

    startTransition(async () => {
      const result = await addManualRecord(
        assessmentId, manualLabel, manualNotes, actionId,
        isIdentity ? (verifiedAt || null) : null
      );
      if (!result.success) {
        setError(result.error);
      } else {
        setOpenManual(null);
        setManualLabel('');
        setManualNotes('');
        setVerifiedAt('');
        router.refresh();
      }
    });
  }, [assessmentId, manualLabel, manualNotes, verifiedAt, router, startTransition]);

  const handleRequestApproval = useCallback(() => {
    setError(null);
    startTransition(async () => {
      const result = await requestMLROApproval(assessmentId);
      if (!result.success) {
        setError(result.error);
      } else {
        router.refresh();
      }
    });
  }, [assessmentId, router, startTransition]);

  const handleWithdrawApproval = useCallback(() => {
    if (!approvalStatus?.id) return;
    setError(null);
    startTransition(async () => {
      const result = await withdrawApproval(approvalStatus.id);
      if (!result.success) {
        setError(result.error);
      } else {
        router.refresh();
      }
    });
  }, [approvalStatus, router, startTransition]);

  const handleDecideApproval = useCallback((decision: 'approved' | 'rejected') => {
    if (!approvalStatus?.id) return;
    setError(null);
    startTransition(async () => {
      const result = await decideApproval(approvalStatus.id, decision, approvalNotes);
      if (!result.success) {
        setError(result.error);
      } else {
        setApprovalNotes('');
        router.refresh();
      }
    });
  }, [approvalStatus, approvalNotes, router, startTransition]);

  // Build amiqus verification map: actionId -> verification
  const amiqusVerificationByAction = new Map<string, AmiqusVerification>();
  for (const v of amiqusVerifications) {
    // Keep the most recent verification per action
    if (!amiqusVerificationByAction.has(v.action_id) ||
        v.created_at > amiqusVerificationByAction.get(v.action_id)!.created_at) {
      amiqusVerificationByAction.set(v.action_id, v);
    }
  }

  const handleInitiateAmiqus = useCallback((actionId: string) => {
    if (!clientName || !clientEmail) return;
    setError(null);

    startTransition(async () => {
      const result = await initiateAmiqusVerification(
        assessmentId, actionId, clientName, clientEmail
      );
      if (!result.success) {
        setError(result.error);
      } else {
        router.refresh();
      }
    });
  }, [assessmentId, clientName, clientEmail, router, startTransition]);

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

  function renderApprovalWidget() {
    const isMLRO = userRole === 'mlro' || userRole === 'platform_admin';

    if (!approvalStatus || approvalStatus.status === 'withdrawn') {
      return (
        <div className={styles.cddItemActions}>
          <button
            type="button"
            className={styles.chLookupButton}
            onClick={handleRequestApproval}
            disabled={isPending || isFinalised}
          >
            {isPending ? 'Requesting...' : 'Request MLRO Approval'}
          </button>
        </div>
      );
    }

    if (approvalStatus.status === 'pending') {
      return (
        <div className={styles.cddItemEvidence}>
          <div className={styles.cddEvidenceRow} style={{ background: '#fef3c7', borderRadius: '0.375rem', padding: '0.5rem 0.75rem' }}>
            <span style={{ color: '#92400e', fontWeight: 600, fontSize: '0.875rem' }}>
              Awaiting MLRO approval
            </span>
            <span className={styles.evidenceMeta}>
              Requested {formatDate(approvalStatus.requested_at)}
            </span>
          </div>
          {isMLRO && !isFinalised && (
            <div style={{ marginTop: '0.5rem' }}>
              <div className={styles.formField}>
                <label className={styles.formLabel}>Decision notes (optional)</label>
                <textarea
                  value={approvalNotes}
                  onChange={(e) => setApprovalNotes(e.target.value)}
                  rows={2}
                  className={styles.formTextarea}
                  placeholder="Add notes about your decision..."
                />
              </div>
              <div style={{ display: 'flex', gap: '0.5rem' }}>
                <button
                  type="button"
                  className={styles.formSubmit}
                  onClick={() => handleDecideApproval('approved')}
                  disabled={isPending}
                  style={{ background: '#16a34a' }}
                >
                  {isPending ? 'Processing...' : 'Approve'}
                </button>
                <button
                  type="button"
                  className={styles.formSubmit}
                  onClick={() => handleDecideApproval('rejected')}
                  disabled={isPending}
                  style={{ background: '#dc2626' }}
                >
                  {isPending ? 'Processing...' : 'Reject'}
                </button>
              </div>
            </div>
          )}
          {!isMLRO && !isFinalised && (
            <div style={{ marginTop: '0.5rem' }}>
              <button
                type="button"
                className={styles.evidenceActionButton}
                onClick={handleWithdrawApproval}
                disabled={isPending}
              >
                Withdraw Request
              </button>
            </div>
          )}
        </div>
      );
    }

    if (approvalStatus.status === 'approved') {
      return (
        <div className={styles.cddItemEvidence}>
          <div className={styles.cddEvidenceRow} style={{ background: '#dcfce7', borderRadius: '0.375rem', padding: '0.5rem 0.75rem' }}>
            <span style={{ color: '#166534', fontWeight: 600, fontSize: '0.875rem' }}>
              Approved by {approvalStatus.decision_by_name || 'MLRO'}
            </span>
            {approvalStatus.decision_at && (
              <span className={styles.evidenceMeta}>{formatDate(approvalStatus.decision_at)}</span>
            )}
          </div>
          {approvalStatus.decision_notes && (
            <div style={{ fontSize: '0.875rem', color: 'var(--text-secondary)', marginTop: '0.25rem', paddingLeft: '0.75rem' }}>
              {approvalStatus.decision_notes}
            </div>
          )}
        </div>
      );
    }

    if (approvalStatus.status === 'rejected') {
      return (
        <div className={styles.cddItemEvidence}>
          <div className={styles.cddEvidenceRow} style={{ background: '#fee2e2', borderRadius: '0.375rem', padding: '0.5rem 0.75rem' }}>
            <span style={{ color: '#991b1b', fontWeight: 600, fontSize: '0.875rem' }}>
              Rejected by {approvalStatus.decision_by_name || 'MLRO'}
            </span>
            {approvalStatus.decision_at && (
              <span className={styles.evidenceMeta}>{formatDate(approvalStatus.decision_at)}</span>
            )}
          </div>
          {approvalStatus.decision_notes && (
            <div style={{ fontSize: '0.875rem', color: 'var(--text-secondary)', marginTop: '0.25rem', paddingLeft: '0.75rem' }}>
              {approvalStatus.decision_notes}
            </div>
          )}
          {!isFinalised && (
            <div style={{ marginTop: '0.5rem' }}>
              <button
                type="button"
                className={styles.chLookupButton}
                onClick={handleRequestApproval}
                disabled={isPending}
              >
                Request Again
              </button>
            </div>
          )}
        </div>
      );
    }

    return null;
  }

  function renderActionItem(action: MandatoryAction, num: number) {
    const isCompleted = optimisticCompleted.has(action.actionId);
    const itemEvidence = evidenceByAction.get(action.actionId) || [];
    const showCH = isCompaniesHouseAction(action) && isCorporate && registeredNumber;
    const showAmiqus = isIdentityAction(action);
    const showForm = isFormAction(action);
    const showApproval = isApprovalAction(action);
    const showConfirm = isConfirmAction(action);

    // For approval actions, auto-mark as completed if approved
    const approvalCompleted = showApproval && approvalStatus?.status === 'approved';
    const effectiveCompleted = isCompleted || approvalCompleted;

    return (
      <div
        key={action.actionId}
        className={`${styles.cddItemCard} ${effectiveCompleted ? styles.cddItemCompleted : ''}`}
      >
        <div className={styles.cddItemHeader}>
          <label className={styles.cddItemCheckbox}>
            <input
              type="checkbox"
              checked={effectiveCompleted}
              onChange={() => !showApproval && handleToggle(action.actionId, isCompleted)}
              disabled={isFinalised || isPending || showApproval}
              className={styles.cddCheckboxInput}
            />
            <span className={styles.cddItemNumber}>{num}.</span>
            <span className={`${styles.cddItemText} ${effectiveCompleted ? styles.cddItemTextDone : ''}`}>
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

        {/* Verification note (for merged identify+verify actions) */}
        {action.verificationNote && (
          <div className={styles.verificationNote}>
            {renderVerificationNote(action.verificationNote)}
          </div>
        )}

        {/* Matter description confirmation (for confirm_matter_purpose action) */}
        {action.actionId === 'confirm_matter_purpose' && matterDescription && (
          <div className={styles.matterDescriptionQuote}>
            {matterDescription}
          </div>
        )}

        {/* MLRO approval widget */}
        {showApproval && renderApprovalWidget()}

        {/* Per-item evidence list */}
        {itemEvidence.length > 0 && (
          <div className={styles.cddItemEvidence}>
            {itemEvidence.map((ev) => {
              if (ev.evidence_type === 'companies_house') {
                return <CompaniesHouseCard key={ev.id} evidence={ev} />;
              }
              if (ev.evidence_type === 'sow_declaration' || ev.evidence_type === 'sof_declaration') {
                return <DeclarationCard key={ev.id} evidence={ev} />;
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
                  {ev.verified_at && (
                    <span className={styles.verifiedBadge}>
                      Verified: {new Date(ev.verified_at + 'T00:00:00').toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}
                    </span>
                  )}
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
            {showAmiqus && (() => {
              const verification = amiqusVerificationByAction.get(action.actionId);
              if (!verification && amiqusConfigured) {
                return (
                  <button
                    type="button"
                    className={styles.amiqusLinkButton}
                    onClick={() => handleInitiateAmiqus(action.actionId)}
                    disabled={isPending || !clientEmail}
                  >
                    {isPending ? 'Initiating...' : 'Initiate Amiqus Verification'}
                  </button>
                );
              }
              if (verification?.status === 'pending' || verification?.status === 'in_progress') {
                return (
                  <div className={styles.amiqusStatusGroup}>
                    <span className={styles.amiqusStatusPending}>
                      {verification.status === 'pending' ? 'Pending' : 'In Progress'}
                    </span>
                    {verification.perform_url && (
                      <a
                        href={verification.perform_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className={styles.amiqusLinkButton}
                      >
                        Complete Verification
                      </a>
                    )}
                    <a
                      href="https://id.amiqus.co/"
                      target="_blank"
                      rel="noopener noreferrer"
                      className={styles.evidenceActionButton}
                    >
                      View in Amiqus
                    </a>
                  </div>
                );
              }
              if (verification?.status === 'complete') {
                return (
                  <div className={styles.amiqusStatusGroup}>
                    <span className={styles.amiqusStatusComplete}>
                      Verified{verification.verified_at && `: ${new Date(verification.verified_at + 'T00:00:00').toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}`}
                    </span>
                    <a
                      href="https://id.amiqus.co/"
                      target="_blank"
                      rel="noopener noreferrer"
                      className={styles.evidenceActionButton}
                    >
                      View in Amiqus
                    </a>
                  </div>
                );
              }
              if (verification?.status === 'failed' || verification?.status === 'expired') {
                return (
                  <div className={styles.amiqusStatusGroup}>
                    <span className={styles.amiqusStatusFailed}>
                      {verification.status === 'failed' ? 'Failed' : 'Expired'}
                    </span>
                    {amiqusConfigured && (
                      <button
                        type="button"
                        className={styles.amiqusLinkButton}
                        onClick={() => handleInitiateAmiqus(action.actionId)}
                        disabled={isPending || !clientEmail}
                      >
                        Retry Verification
                      </button>
                    )}
                  </div>
                );
              }
              // Fallback: no Amiqus configured, show static link
              return (
                <a
                  href="https://id.amiqus.co/"
                  target="_blank"
                  rel="noopener noreferrer"
                  className={styles.amiqusLinkButton}
                >
                  Verify via Amiqus
                </a>
              );
            })()}
            {showForm && (
              <button
                type="button"
                className={styles.evidenceActionButton}
                onClick={() => {
                  setOpenForm(openForm === action.actionId ? null : action.actionId);
                  setOpenUpload(null);
                  setOpenManual(null);
                }}
                disabled={isPending}
              >
                {openForm === action.actionId ? 'Close Form' : 'Open Form'}
              </button>
            )}
            {showConfirm ? (
              <button
                type="button"
                className={effectiveCompleted ? styles.evidenceActionButton : styles.formSubmit}
                onClick={() => handleToggle(action.actionId, isCompleted)}
                disabled={isPending || effectiveCompleted}
              >
                {effectiveCompleted ? 'Confirmed' : 'Confirm'}
              </button>
            ) : !showApproval && (
              <>
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
              </>
            )}
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
            {showAmiqus && (
              <div className={styles.formField}>
                <label htmlFor={`verified-at-upload-${action.actionId}`} className={styles.formLabel}>
                  Date of verification
                </label>
                <input
                  id={`verified-at-upload-${action.actionId}`}
                  type="date"
                  name="verified_at"
                  className={styles.formInput}
                />
              </div>
            )}
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
            onSubmit={(e) => handleManualRecord(action.actionId, showAmiqus, e)}
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
            {showAmiqus && (
              <div className={styles.formField}>
                <label htmlFor={`verified-at-manual-${action.actionId}`} className={styles.formLabel}>
                  Date of verification
                </label>
                <input
                  id={`verified-at-manual-${action.actionId}`}
                  type="date"
                  value={verifiedAt}
                  onChange={(e) => setVerifiedAt(e.target.value)}
                  className={styles.formInput}
                />
              </div>
            )}
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

        {/* Inline SoW/SoF declaration form */}
        {openForm === action.actionId && showForm && (() => {
          const formType = action.actionId === 'sow_form' ? 'sow' as const : 'sof' as const;
          const clientType = isCorporate ? 'corporate' as const : 'individual' as const;
          const formConfig = getSowSofFormConfig(formType, clientType);
          // Find existing declaration data
          const existingDeclaration = itemEvidence.find(
            (ev) => ev.evidence_type === (formType === 'sow' ? 'sow_declaration' : 'sof_declaration')
          );
          const existingData = existingDeclaration?.data as Record<string, string | string[]> | null;
          return (
            <SowSofForm
              formType={formType}
              formConfig={formConfig}
              assessmentId={assessmentId}
              existingData={existingData}
              onClose={() => setOpenForm(null)}
            />
          );
        })()}
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
