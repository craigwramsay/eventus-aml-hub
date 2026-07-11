'use client';

import { useState } from 'react';
import type { MandatoryAction } from '@/lib/rules-engine/types';
import type { AssessmentEvidence, CddItemProgress, AmiqusVerification, ClioDriveSync } from '@/lib/supabase/types';
import type { PriorPersonVerification } from '@/app/actions/amiqus';
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
  /** Prior Amiqus verifications keyed by person display name (for per-person carry-forward) */
  priorPersonVerifications?: Record<string, PriorPersonVerification>;
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
  onConfirmStillValid: (
    actionId: string,
    person?: { name: string; amiqusRecordId: number; amiqusClientId: number | null; verifiedAt: string | null } | null,
  ) => void;
  onDocumentConfirm: (actionId: string) => void;
  onInitiateAmiqus: (actionId: string, name: string, email: string) => void;
  onLinkAmiqus: (actionId: string, e: React.FormEvent<HTMLFormElement>) => void;
  onRequestApproval: () => void;
  onWithdrawApproval: () => void;
  onDecideApproval: (decision: 'approved' | 'rejected', notes: string) => void;
  // Link amiqus form state (shared)
  linkRecordId: string;
  setLinkRecordId: (v: string) => void;
  linkOriginalDate: string;
  setLinkOriginalDate: (v: string) => void;
  openLinkAmiqus: string | null;
  setOpenLinkAmiqus: (v: string | null) => void;
  /** Name of the person the link form is scoped to (set when opened from the per-person panel). */
  linkForPersonName: string | null;
  /** Open the shared link form pre-scoped to a specific director / BO name. */
  onOpenLinkForPerson: (actionId: string, personName: string) => void;
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
  priorPersonVerifications = {},
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
  linkOriginalDate,
  setLinkOriginalDate,
  openLinkAmiqus,
  setOpenLinkAmiqus,
  linkForPersonName,
  onOpenLinkForPerson,
}: CDDChecklistItemProps) {
  const effectiveCompleted = isCompleted || approvalCompleted;
  const showCH = isCompaniesHouseAction(action) && isCorporate && !!registeredNumber;
  const showAmiqus = isIdentityAction(action);
  const showForm = isFormAction(action);
  const showApproval = isApprovalAction(action);
  const showConfirm = isConfirmAction(action);
  const showDocumentConfirm = isDocumentConfirmAction(action);
  // Multi-person identity items (directors / beneficial owners). Carry-forward
  // on these is per-person — the blanket "client's most recent verification"
  // prompt is too coarse when there are multiple individuals to verify.
  const isMultiPersonIdentity = showAmiqus &&
    (action.actionId === 'identify_and_verify_directors' ||
      action.actionId === 'identify_and_verify_beneficial_owners');

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
            isFinalised={isFinalised}
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

      {/* Confirm Still Valid (carry-forward) — blanket version for single-person identity items only.
          Multi-person items (directors / BOs) render a per-person block below. */}
      {showAmiqus && !isMultiPersonIdentity && !isFinalised && canConfirmStillValid(lastCddVerifiedAt, riskLevel) && itemEvidence.length === 0 && !effectiveCompleted && (
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

      {/* Per-person carry-forward for multi-person identity items. One row per named
          director / beneficial owner, each showing whether THAT person already has a
          prior Amiqus verification on this client and (when within the review window)
          a Confirm Still Valid button scoped to them. */}
      {showAmiqus && isMultiPersonIdentity && !isFinalised && !effectiveCompleted && personList && personList.length > 0 && (
        <PerPersonCarryForwardBlock
          actionId={action.actionId}
          personList={personList}
          riskLevel={riskLevel}
          priorPersonVerifications={priorPersonVerifications}
          verifications={verifications}
          itemEvidence={itemEvidence}
          isPending={isPending}
          confirmingAction={confirmingAction}
          onConfirmStillValid={onConfirmStillValid}
          onOpenLinkForPerson={onOpenLinkForPerson}
        />
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
        linkOriginalDate={linkOriginalDate}
        setLinkOriginalDate={setLinkOriginalDate}
        openLinkAmiqus={openLinkAmiqus}
        setOpenLinkAmiqus={setOpenLinkAmiqus}
        linkForPersonName={linkForPersonName}
      />
    </div>
  );
}

/**
 * Per-person carry-forward block. One row per named director / BO showing:
 *   - "verified on X (N months ago) — Confirm Still Valid" when there's a
 *     prior matching Amiqus and it's within the risk-based review window
 *   - "verified on X — review window exceeded" when there's a prior match but
 *     it's stale
 *   - "no prior verification on file" when there's no match
 * Hides each row once a verification exists for that person on the current
 * assessment (matched by name in amiqus_client_name) OR a carry-forward
 * confirmation evidence row has already been created for them.
 */
function PerPersonCarryForwardBlock(props: {
  actionId: string;
  personList: string[];
  riskLevel: string | undefined;
  priorPersonVerifications: Record<string, PriorPersonVerification>;
  verifications: AmiqusVerification[];
  itemEvidence: AssessmentEvidence[];
  isPending: boolean;
  confirmingAction: string | null;
  onConfirmStillValid: (
    actionId: string,
    person?: { name: string; amiqusRecordId: number; amiqusClientId: number | null; verifiedAt: string | null } | null,
  ) => void;
  onOpenLinkForPerson: (actionId: string, personName: string) => void;
}) {
  const {
    actionId,
    personList,
    riskLevel,
    priorPersonVerifications,
    verifications,
    itemEvidence,
    isPending,
    confirmingAction,
    onConfirmStillValid,
    onOpenLinkForPerson,
  } = props;

  // Lowercase-trim quick comparator for "do we already have an Amiqus row for
  // this person on the current assessment". We're matching display names from
  // the directors/BOs list against amiqus_client_name on the verification row.
  const normaliseLoose = (s: string) => s.toLowerCase().replace(/\s+/g, ' ').trim();
  const currentVerifiedNames = new Set(
    verifications
      .filter(v => v.status === 'complete' && v.amiqus_client_name)
      .map(v => normaliseLoose(v.amiqus_client_name!))
  );

  // Carry-forward confirmation evidence rows already written for this assessment
  // — render no row for those names so we don't offer a duplicate confirm.
  const carriedForwardNames = new Set(
    itemEvidence
      .filter(e =>
        e.evidence_type === 'manual_record' &&
        typeof e.label === 'string' &&
        e.label.startsWith('Prior identity verification confirmed still valid for ')
      )
      .map(e => {
        const data = (e.data ?? {}) as Record<string, unknown>;
        const name = typeof data.person_name === 'string' ? data.person_name : '';
        return name ? normaliseLoose(name) : '';
      })
      .filter(Boolean)
  );

  const rows = personList.map(name => {
    const looseName = normaliseLoose(name);
    if (currentVerifiedNames.has(looseName)) return null;
    if (carriedForwardNames.has(looseName)) return null;
    const prior = priorPersonVerifications[name] ?? null;
    return { name, prior };
  }).filter(Boolean) as Array<{ name: string; prior: PriorPersonVerification | null }>;

  if (rows.length === 0) return null;

  return (
    <div className={`${styles.confirmStillValidBlock} ${styles.itemFullRow}`}>
      <p className={styles.confirmStillValidInfo} style={{ marginBottom: '0.5rem', fontWeight: 600 }}>
        Carry-forward from prior verifications
      </p>
      <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
        {rows.map(({ name, prior }) => {
          const linkForPersonButton = (
            <button
              type="button"
              className={styles.evidenceActionButton}
              onClick={() => onOpenLinkForPerson(actionId, name)}
              disabled={isPending}
              style={{ fontSize: '0.8rem' }}
            >
              Link Existing for {name}
            </button>
          );
          if (!prior || !prior.verifiedAt) {
            return (
              <li key={name} style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap' }}>
                <strong style={{ fontSize: '0.875rem' }}>{name}</strong>
                <span style={{ fontSize: '0.85rem', color: 'var(--text-muted, #666)', fontStyle: 'italic' }}>
                  No prior verification on file.
                </span>
                {linkForPersonButton}
              </li>
            );
          }
          const inWindow = canConfirmStillValid(prior.verifiedAt, riskLevel);
          const trackingKey = `${actionId}::${name}`;
          const confirming = confirmingAction === trackingKey;
          return (
            <li key={name} style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap' }}>
              <strong style={{ fontSize: '0.875rem' }}>{name}</strong>
              <span style={{ fontSize: '0.85rem', color: 'var(--text-muted, #666)' }}>
                Last verified {formatDateShort(prior.verifiedAt)} ({monthsSince(prior.verifiedAt)} months ago) — Amiqus case {prior.amiqusRecordId}
              </span>
              {inWindow ? (
                <button
                  type="button"
                  className={styles.confirmStillValidButton}
                  onClick={() => onConfirmStillValid(actionId, {
                    name,
                    amiqusRecordId: prior.amiqusRecordId,
                    amiqusClientId: prior.amiqusClientId,
                    verifiedAt: prior.verifiedAt,
                  })}
                  disabled={isPending || confirming}
                >
                  {confirming ? 'Confirming…' : `Confirm Still Valid for ${name}`}
                </button>
              ) : (
                <span style={{ fontSize: '0.8rem', color: 'var(--danger, #c00)', fontStyle: 'italic' }}>
                  Review window exceeded — a fresh verification is required.
                </span>
              )}
              {linkForPersonButton}
            </li>
          );
        })}
      </ul>
      <p className={styles.formHint} style={{ marginTop: '0.5rem' }}>
        Carry-forward applies per named individual. Tick this checklist item once every person above is verified.
      </p>
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
