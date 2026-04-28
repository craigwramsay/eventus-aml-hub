'use client';

import { useState } from 'react';
import type { MandatoryAction } from '@/lib/rules-engine/types';
import type { AssessmentEvidence, CddItemProgress, AmiqusVerification, ClioDriveSync } from '@/lib/supabase/types';
import { EvidencePanel } from './EvidencePanel';
import { ItemActionBar } from './ItemActionBar';
import { BeneficialOwnersEditor } from './BeneficialOwnersEditor';
import styles from './page.module.css';

/** Check if an action should show a CH lookup button */
function isCompaniesHouseAction(action: MandatoryAction): boolean {
  return action.actionId === 'companies_house_search' ||
    (action.evidenceTypes?.includes('companies_house_report') ?? false);
}

/** Check if an action is identity verification (Amiqus) */
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

/** Check if an action is a confirmation-only action (tick to acknowledge) */
function isConfirmAction(action: MandatoryAction): boolean {
  return action.actionId === 'confirm_matter_purpose' ||
    action.actionId === 'verify_consistency' ||
    action.actionId === 'confirm_transparency' ||
    action.actionId === 'ongoing_monitoring' ||
    action.actionId === 'enhanced_monitoring' ||
    action.actionId === 'confirm_bo';
}

/** Check if an action is a document-confirm action */
function isDocumentConfirmAction(action: MandatoryAction): boolean {
  return action.actionId === 'obtain_documents';
}

/** Check if an action is an MLRO approval action */
function isApprovalAction(action: MandatoryAction): boolean {
  return action.actionId === 'senior_management_approval' || action.actionId === 'mlro_approval';
}

/** CDD staleness thresholds (months) for carry-forward eligibility */
const CDD_THRESHOLDS: Record<string, number> = { HIGH: 12, MEDIUM: 24, LOW: 24 };
const CDD_LONGSTOP_MONTHS = 24;

function canConfirmStillValid(
  lastCddVerifiedAt: string | null | undefined,
  riskLevel: string | undefined
): boolean {
  if (!lastCddVerifiedAt) return false;
  const verified = new Date(lastCddVerifiedAt);
  const now = new Date();
  const longstopDate = new Date(verified);
  longstopDate.setMonth(longstopDate.getMonth() + CDD_LONGSTOP_MONTHS);
  if (now >= longstopDate) return false;
  const normalisedRisk = (riskLevel || 'MEDIUM').toUpperCase();
  const thresholdMonths = CDD_THRESHOLDS[normalisedRisk] ?? 24;
  const thresholdDate = new Date(verified);
  thresholdDate.setMonth(thresholdDate.getMonth() + thresholdMonths);
  if (now >= thresholdDate) return false;
  return true;
}

function monthsSince(dateStr: string): number {
  const d = new Date(dateStr);
  const now = new Date();
  return Math.floor((now.getTime() - d.getTime()) / (1000 * 60 * 60 * 24 * 30.44));
}

function formatDateShort(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
}

/**
 * Render a verification note with numbered items on separate lines.
 */
function renderVerificationNote(note: string): React.ReactNode {
  const match = note.match(/^(.+?):\s*(\(1\).+)$/);
  if (!match) return note;

  const heading = match[1].trim();
  let body = match[2];

  let authority = '';
  const authMatch = body.match(/\.\s*(Authority:.+)$/);
  if (authMatch) {
    authority = authMatch[1];
    body = body.replace(/\.\s*Authority:.+$/, '.');
  }

  const items: string[] = [];
  const itemRegex = /\((\d+)\)\s*/g;
  let m: RegExpExecArray | null;
  const starts: number[] = [];

  while ((m = itemRegex.exec(body)) !== null) {
    if (m.index === 0 || /[\s,]$/.test(body.slice(0, m.index))) {
      starts.push(m.index);
    }
  }

  for (let i = 0; i < starts.length; i++) {
    const end = i + 1 < starts.length ? starts[i + 1] : body.length;
    const segment = body.slice(starts[i], end).trim();
    items.push(segment.replace(/,\s*or\s*$/, ''));
  }

  if (items.length === 0) return note;

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

interface CDDChecklistItemProps {
  action: MandatoryAction;
  num: number;
  /** Optional list of related person names (e.g. directors, beneficial owners) to display under the requirement */
  personList?: string[] | null;
  /** True if this is the BO list — enables the inline editor */
  isBeneficialOwnerList?: boolean;
  assessmentId: string;
  isCompleted: boolean;
  approvalCompleted: boolean;
  itemEvidence: AssessmentEvidence[];
  progressRecord?: CddItemProgress;
  isPending: boolean;
  isFinalised: boolean;
  isCorporate: boolean;
  registeredNumber: string | null;
  amiqusConfigured: boolean;
  clientEmail: string;
  lastCddVerifiedAt?: string | null;
  riskLevel?: string;
  matterDescription?: string;
  verifications: AmiqusVerification[];
  clientAmiqus?: { amiqusRecordId: number; amiqusClientId: number | null; verifiedAt: string | null } | null;
  priorSowData?: Record<string, string | string[]> | null;
  syncRecords: ClioDriveSync[];
  userNames: Record<string, string>;
  approvalStatus?: {
    id: string;
    status: 'pending' | 'approved' | 'rejected' | 'withdrawn';
    requested_at: string;
    decision_by_name?: string | null;
    decision_at?: string | null;
    decision_notes?: string | null;
  } | null;
  userRole?: string;
  confirmingAction: string | null;
  // Handlers
  onToggle: (actionId: string, isCompleted: boolean) => void;
  onCHLookup: (actionId: string) => void;
  onFileUpload: (actionId: string, e: React.FormEvent<HTMLFormElement>) => void;
  onManualRecord: (actionId: string, notes: string, verifiedAt: string | null) => void;
  onManualIdv: (actionId: string, data: {
    photoIdType: string;
    proofOfAddressType: string;
    proofOfAddressDate: string;
    verificationDate: string;
    notes?: string;
  }) => void;
  onConfirmStillValid: (actionId: string) => void;
  onDocumentConfirm: (actionId: string) => void;
  onInitiateAmiqus: (actionId: string, name: string, email: string) => void;
  onLinkAmiqus: (actionId: string, e: React.FormEvent<HTMLFormElement>) => void;
  onRequestApproval: () => void;
  onWithdrawApproval: () => void;
  onDecideApproval: (decision: 'approved' | 'rejected', notes: string) => void;
  // Link amiqus form state (shared)
  linkRecordId: string;
  setLinkRecordId: (v: string) => void;
  openLinkAmiqus: string | null;
  setOpenLinkAmiqus: (v: string | null) => void;
}

export function CDDChecklistItem({
  action,
  num,
  personList,
  isBeneficialOwnerList,
  assessmentId,
  isCompleted,
  approvalCompleted,
  itemEvidence,
  progressRecord,
  isPending,
  isFinalised,
  isCorporate,
  registeredNumber,
  amiqusConfigured,
  clientEmail,
  lastCddVerifiedAt,
  riskLevel,
  matterDescription,
  verifications,
  clientAmiqus,
  priorSowData,
  syncRecords,
  userNames,
  approvalStatus,
  userRole,
  confirmingAction,
  onToggle,
  onCHLookup,
  onFileUpload,
  onManualRecord,
  onManualIdv,
  onConfirmStillValid,
  onDocumentConfirm,
  onInitiateAmiqus,
  onLinkAmiqus,
  onRequestApproval,
  onWithdrawApproval,
  onDecideApproval,
  linkRecordId,
  setLinkRecordId,
  openLinkAmiqus,
  setOpenLinkAmiqus,
}: CDDChecklistItemProps) {
  const effectiveCompleted = isCompleted || approvalCompleted;
  const showCH = isCompaniesHouseAction(action) && isCorporate && !!registeredNumber;
  const showAmiqus = isIdentityAction(action);
  const showForm = isFormAction(action);
  const showApproval = isApprovalAction(action);
  const showConfirm = isConfirmAction(action);
  const showDocumentConfirm = isDocumentConfirmAction(action);

  const completionDate = progressRecord?.completed_at
    ? formatDateShort(progressRecord.completed_at)
    : null;

  const hasEvidence = itemEvidence.length > 0;
  const hasAmiqusInfo = showAmiqus && (verifications.length > 0 || (clientAmiqus && effectiveCompleted));

  // Items where the action itself is the evidence (no separate evidence record needed)
  const isTickOnly = showConfirm || showDocumentConfirm || showApproval ||
    action.actionId === 'ongoing_monitoring' || action.actionId === 'enhanced_monitoring';

  // Build completion attribution text
  const completedByName = progressRecord?.completed_by ? userNames[progressRecord.completed_by] : null;

  // Empty evidence column message
  const emptyEvidenceText = isTickOnly
    ? (showApproval && approvalCompleted
      ? `Approved by ${approvalStatus?.decision_by_name || 'MLRO'}${approvalStatus?.decision_at ? ` on ${formatDateShort(approvalStatus.decision_at)}` : ''}`
      : effectiveCompleted ? 'Confirmed by user' : 'Awaiting confirmation')
    : (effectiveCompleted ? 'No evidence recorded' : 'No evidence yet');

  return (
    <div className={`${styles.cddItemCard} ${effectiveCompleted ? styles.cddItemCompleted : ''}`}>
      {/* ── ZONE 1: WHAT — the requirement ── */}
      <div className={styles.itemRequirement}>
        <span className={styles.cddItemNumber}>{num}.</span>
        <div className={styles.cddItemTextWrap}>
          <span className={styles.cddItemText}>
            {action.displayText || action.description}
          </span>
          {isBeneficialOwnerList ? (
            <BeneficialOwnersEditor
              assessmentId={assessmentId}
              names={personList || []}
              isFinalised={isFinalised}
            />
          ) : personList && personList.length > 0 ? (
            <div className={styles.personList}>
              <div className={styles.personListLabel}>
                {personList.length === 1 ? 'Person' : `${personList.length} persons`}
              </div>
              <ul className={styles.personListItems}>
                {personList.map((name, i) => (
                  <li key={i} className={styles.personListItem}>{name}</li>
                ))}
              </ul>
            </div>
          ) : null}
        </div>
      </div>

      {/* ── ZONE 2: HOW — what satisfied it ── */}
      {(hasEvidence || hasAmiqusInfo) ? (
        <div className={styles.itemEvidenceCol}>
          <EvidencePanel
            evidence={itemEvidence}
            progressRecord={progressRecord}
            isCompleted={effectiveCompleted}
            isApprovalAction={showApproval}
            syncRecords={syncRecords}
            userNames={userNames}
            verifications={showAmiqus ? verifications : []}
            clientAmiqus={showAmiqus ? clientAmiqus : undefined}
          />
        </div>
      ) : (
        <div className={styles.itemEvidenceEmpty}>
          {emptyEvidenceText}
        </div>
      )}

      {/* ── ZONE 3: STATUS ── */}
      <div className={`${styles.itemStatusCol} ${effectiveCompleted ? styles.itemStatusComplete : styles.itemStatusPending}`}>
        <label className={styles.statusCheckLabel}>
          <input
            type="checkbox"
            checked={effectiveCompleted}
            onChange={() => !showApproval && onToggle(action.actionId, isCompleted)}
            disabled={isFinalised || isPending || showApproval}
            className={styles.cddCheckboxInput}
          />
          {effectiveCompleted ? 'Complete' : 'Pending'}
        </label>
        {effectiveCompleted && completionDate && (
          <span className={styles.statusDate}>
            {completionDate}
            {completedByName && <br />}
            {completedByName && completedByName}
          </span>
        )}
      </div>

      {/* Full-width rows below the 3 columns */}

      {/* Verification note (only shown when NOT yet completed) */}
      {!effectiveCompleted && action.verificationNote && (
        <div className={`${styles.itemMeta} ${styles.itemFullRow}`}>
          <div className={styles.verificationNote}>
            {renderVerificationNote(action.verificationNote)}
          </div>
        </div>
      )}

      {/* Matter description (only shown when NOT yet completed — useful during assessment, noise after) */}
      {!effectiveCompleted && action.actionId === 'confirm_matter_purpose' && matterDescription && (
        <div className={`${styles.itemMeta} ${styles.itemFullRow}`}>
          <div className={styles.matterDescriptionQuote}>
            {matterDescription}
          </div>
        </div>
      )}

      {/* Approval widget — hide on finalised when already approved (evidence column shows it) */}
      {showApproval && !(isFinalised && approvalCompleted) && (
        <div className={`${styles.itemMeta} ${styles.itemFullRow}`}>
          {renderApprovalWidget(approvalStatus, userRole, isFinalised, isPending, onRequestApproval, onWithdrawApproval, onDecideApproval)}
        </div>
      )}

      {/* Confirm Still Valid (carry-forward) */}
      {showAmiqus && !isFinalised && canConfirmStillValid(lastCddVerifiedAt, riskLevel) && itemEvidence.length === 0 && !effectiveCompleted && (
        <div className={`${styles.confirmStillValidBlock} ${styles.itemFullRow}`}>
          <p className={styles.confirmStillValidInfo}>
            Identity last verified on{' '}
            {new Date(lastCddVerifiedAt!).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })}
            {' '}({monthsSince(lastCddVerifiedAt!)} months ago)
          </p>
          <button
            type="button"
            className={styles.confirmStillValidButton}
            onClick={() => onConfirmStillValid(action.actionId)}
            disabled={isPending || confirmingAction === action.actionId}
          >
            {confirmingAction === action.actionId ? 'Confirming...' : 'Confirm Still Valid'}
          </button>
        </div>
      )}

      {/* Action bar */}
      <ItemActionBar
        action={action}
        assessmentId={assessmentId}
        isPending={isPending}
        isFinalised={isFinalised}
        isCorporate={isCorporate}
        registeredNumber={registeredNumber}
        isCompleted={effectiveCompleted}
        showCH={showCH}
        showAmiqus={showAmiqus}
        showForm={showForm}
        showApproval={showApproval}
        showConfirm={showConfirm}
        showDocumentConfirm={showDocumentConfirm}
        amiqusConfigured={amiqusConfigured}
        clientEmail={clientEmail}
        itemEvidence={itemEvidence}
        verifications={verifications}
        priorSowData={priorSowData}
        onCHLookup={onCHLookup}
        onToggle={onToggle}
        onDocumentConfirm={onDocumentConfirm}
        onInitiateAmiqus={onInitiateAmiqus}
        onLinkAmiqus={onLinkAmiqus}
        onFileUpload={onFileUpload}
        onManualRecord={onManualRecord}
        onManualIdv={onManualIdv}
        linkRecordId={linkRecordId}
        setLinkRecordId={setLinkRecordId}
        openLinkAmiqus={openLinkAmiqus}
        setOpenLinkAmiqus={setOpenLinkAmiqus}
      />
    </div>
  );
}

/** Renders the MLRO approval widget */
function renderApprovalWidget(
  approvalStatus: CDDChecklistItemProps['approvalStatus'],
  userRole: string | undefined,
  isFinalised: boolean,
  isPending: boolean,
  onRequestApproval: () => void,
  onWithdrawApproval: () => void,
  onDecideApproval: (decision: 'approved' | 'rejected', notes: string) => void,
) {
  const isMLRO = userRole === 'mlro' || userRole === 'platform_admin';

  if (!approvalStatus || approvalStatus.status === 'withdrawn') {
    return (
      <div style={{ marginTop: '0.5rem' }}>
        <button
          type="button"
          className={styles.chLookupButton}
          onClick={onRequestApproval}
          disabled={isPending || isFinalised}
        >
          {isPending ? 'Requesting...' : 'Request MLRO Approval'}
        </button>
      </div>
    );
  }

  if (approvalStatus.status === 'pending') {
    return (
      <div style={{ marginTop: '0.5rem' }}>
        <div style={{ background: '#fef3c7', borderRadius: '0.375rem', padding: '0.5rem 0.75rem', display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
          <span style={{ color: '#92400e', fontWeight: 600, fontSize: '0.875rem' }}>
            Awaiting MLRO approval
          </span>
          <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
            Requested {new Date(approvalStatus.requested_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}
          </span>
        </div>
        {isMLRO && !isFinalised && (
          <ApprovalDecisionForm isPending={isPending} onDecide={onDecideApproval} />
        )}
        {!isMLRO && !isFinalised && (
          <button
            type="button"
            className={styles.evidenceActionButton}
            onClick={onWithdrawApproval}
            disabled={isPending}
            style={{ marginTop: '0.375rem' }}
          >
            Withdraw Request
          </button>
        )}
      </div>
    );
  }

  if (approvalStatus.status === 'approved') {
    return (
      <div style={{ marginTop: '0.5rem' }}>
        <div style={{ background: '#dcfce7', borderRadius: '0.375rem', padding: '0.5rem 0.75rem', display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
          <span style={{ color: '#166534', fontWeight: 600, fontSize: '0.875rem' }}>
            Approved by {approvalStatus.decision_by_name || 'MLRO'}
          </span>
          {approvalStatus.decision_at && (
            <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
              {new Date(approvalStatus.decision_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}
            </span>
          )}
        </div>
        {approvalStatus.decision_notes && (
          <div style={{ fontSize: '0.8125rem', color: 'var(--text-secondary)', marginTop: '0.25rem', fontStyle: 'italic' }}>
            {approvalStatus.decision_notes}
          </div>
        )}
      </div>
    );
  }

  if (approvalStatus.status === 'rejected') {
    return (
      <div style={{ marginTop: '0.5rem' }}>
        <div style={{ background: '#fee2e2', borderRadius: '0.375rem', padding: '0.5rem 0.75rem', display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
          <span style={{ color: '#991b1b', fontWeight: 600, fontSize: '0.875rem' }}>
            Rejected by {approvalStatus.decision_by_name || 'MLRO'}
          </span>
          {approvalStatus.decision_at && (
            <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
              {new Date(approvalStatus.decision_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}
            </span>
          )}
        </div>
        {approvalStatus.decision_notes && (
          <div style={{ fontSize: '0.8125rem', color: 'var(--text-secondary)', marginTop: '0.25rem', fontStyle: 'italic' }}>
            {approvalStatus.decision_notes}
          </div>
        )}
        {!isFinalised && (
          <button
            type="button"
            className={styles.chLookupButton}
            onClick={onRequestApproval}
            disabled={isPending}
            style={{ marginTop: '0.375rem' }}
          >
            Re-request Approval
          </button>
        )}
      </div>
    );
  }

  return null;
}

/** MLRO approval decision form (inline) */
function ApprovalDecisionForm({
  isPending,
  onDecide,
}: {
  isPending: boolean;
  onDecide: (decision: 'approved' | 'rejected', notes: string) => void;
}) {
  const [notes, setNotes] = useState('');

  return (
    <div style={{ marginTop: '0.5rem' }}>
      <div className={styles.formField}>
        <label className={styles.formLabel}>Decision notes (optional)</label>
        <textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          rows={2}
          className={styles.formTextarea}
          placeholder="Add notes about your decision..."
        />
      </div>
      <div style={{ display: 'flex', gap: '0.5rem' }}>
        <button
          type="button"
          className={styles.formSubmit}
          onClick={() => onDecide('approved', notes)}
          disabled={isPending}
          style={{ background: '#16a34a' }}
        >
          {isPending ? 'Processing...' : 'Approve'}
        </button>
        <button
          type="button"
          className={styles.formSubmit}
          onClick={() => onDecide('rejected', notes)}
          disabled={isPending}
          style={{ background: '#dc2626' }}
        >
          {isPending ? 'Processing...' : 'Reject'}
        </button>
      </div>
    </div>
  );
}
