'use client';

/**
 * CDD Checklist
 *
 * Outer wrapper for CDD requirements. Handles:
 * - Category grouping with progress counters
 * - EDD section with trigger descriptions
 * - All server action handler callbacks
 * - State management for optimistic UI
 *
 * Individual items delegated to CDDChecklistItem.
 */

import { useState, useEffect, useTransition, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import type { MandatoryAction, EDDTriggerResult } from '@/lib/rules-engine/types';
import type { AssessmentEvidence, CddItemProgress, AmiqusVerification, ClioDriveSync } from '@/lib/supabase/types';
import { toggleItemCompletion } from '@/app/actions/progress';
import { uploadEvidence, addManualRecord, lookupCompaniesHouse, confirmIdentityStillValid, confirmDocumentSaved, recordManualIdVerification } from '@/app/actions/evidence';
import { requestMLROApproval, withdrawApproval, decideApproval } from '@/app/actions/approvals';
import { initiateAmiqusVerification, linkExistingAmiqusRecord } from '@/app/actions/amiqus';
import { CDDChecklistItem } from './CDDChecklistItem';
import styles from './page.module.css';

/** Category display labels */
const CATEGORY_LABELS: Record<string, string> = {
  cdd: 'CUSTOMER DUE DILIGENCE',
  edd: 'ENHANCED DUE DILIGENCE',
  sow: 'SOURCE OF WEALTH',
  sof: 'SOURCE OF FUNDS',
  escalation: 'ESCALATION',
  monitoring: 'ONGOING MONITORING',
};

const CATEGORY_ORDER = ['cdd', 'edd', 'sow', 'sof', 'escalation', 'monitoring'];

interface CDDChecklistProps {
  assessmentId: string;
  actions: MandatoryAction[];
  eddActions: MandatoryAction[];
  eddTriggers: EDDTriggerResult[];
  evidence: AssessmentEvidence[];
  progress: CddItemProgress[];
  isCorporate: boolean;
  registeredNumber: string | null;
  isFinalised: boolean;
  approvalStatus?: {
    id: string;
    status: 'pending' | 'approved' | 'rejected' | 'withdrawn';
    requested_at: string;
    decision_by_name?: string | null;
    decision_at?: string | null;
    decision_notes?: string | null;
  } | null;
  userRole?: string;
  matterDescription?: string;
  amiqusVerifications?: AmiqusVerification[];
  amiqusConfigured?: boolean;
  clientName?: string;
  clientEmail?: string;
  lastCddVerifiedAt?: string | null;
  riskLevel?: string;
  priorSowData?: Record<string, string | string[]> | null;
  syncRecords?: ClioDriveSync[];
  userNames?: Record<string, string>;
  clientAmiqus?: { amiqusRecordId: number; amiqusClientId: number | null; verifiedAt: string | null } | null;
  /** Director names from latest Companies House lookup (for "Identify and verify all directors") */
  directorNames?: string[];
  /** Manually-entered beneficial owner names (for "Identify and verify all beneficial owners") */
  beneficialOwnerNames?: string[];
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
  lastCddVerifiedAt,
  riskLevel,
  priorSowData,
  syncRecords = [],
  userNames = {},
  clientAmiqus,
  directorNames = [],
  beneficialOwnerNames = [],
}: CDDChecklistProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [confirmingAction, setConfirmingAction] = useState<string | null>(null);
  const [openLinkAmiqus, setOpenLinkAmiqus] = useState<string | null>(null);
  const [linkRecordId, setLinkRecordId] = useState('');
  const [linkOriginalDate, setLinkOriginalDate] = useState('');

  // Build a set of completed action IDs for optimistic UI
  const [optimisticCompleted, setOptimisticCompleted] = useState<Set<string>>(() => {
    const set = new Set<string>();
    for (const p of progress) {
      if (p.completed_at) set.add(p.action_id);
    }
    return set;
  });

  // Sync optimistic state when server progress changes
  useEffect(() => {
    const serverSet = new Set<string>();
    for (const p of progress) {
      if (p.completed_at) serverSet.add(p.action_id);
    }
    setOptimisticCompleted(serverSet);
  }, [progress]);

  // Build evidence map: actionId -> evidence[]
  const evidenceByAction = new Map<string, AssessmentEvidence[]>();
  for (const e of evidence) {
    if (e.action_id) {
      const list = evidenceByAction.get(e.action_id) || [];
      list.push(e);
      evidenceByAction.set(e.action_id, list);
    }
  }

  // Build progress map: actionId -> progress record
  const progressByAction = new Map<string, CddItemProgress>();
  for (const p of progress) {
    progressByAction.set(p.action_id, p);
  }

  // Build all Amiqus verifications grouped by action (sorted oldest-first by created_at)
  const amiqusVerificationsByAction = new Map<string, AmiqusVerification[]>();
  const sorted = [...amiqusVerifications].sort(
    (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
  );
  for (const v of sorted) {
    const list = amiqusVerificationsByAction.get(v.action_id) || [];
    list.push(v);
    amiqusVerificationsByAction.set(v.action_id, list);
  }

  // ── Handler callbacks ──

  const handleToggle = useCallback((actionId: string, currentlyCompleted: boolean) => {
    if (isFinalised) return;
    setError(null);
    setOptimisticCompleted(prev => {
      const next = new Set(prev);
      if (currentlyCompleted) next.delete(actionId);
      else next.add(actionId);
      return next;
    });
    startTransition(async () => {
      const result = await toggleItemCompletion(assessmentId, actionId, !currentlyCompleted);
      if (!result.success) {
        setOptimisticCompleted(prev => {
          const next = new Set(prev);
          if (currentlyCompleted) next.add(actionId);
          else next.delete(actionId);
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
        setOptimisticCompleted(prev => { const next = new Set(prev); next.add(actionId); return next; });
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
      if (!result.success) setError(result.error);
      else router.refresh();
    });
  }, [assessmentId, router, startTransition]);

  const handleManualRecord = useCallback((actionId: string, notes: string, verifiedAt: string | null) => {
    setError(null);
    startTransition(async () => {
      const result = await addManualRecord(assessmentId, 'File note', notes, actionId, verifiedAt);
      if (!result.success) setError(result.error);
      else router.refresh();
    });
  }, [assessmentId, router, startTransition]);

  const handleManualIdv = useCallback((actionId: string, data: {
    photoIdType: string;
    proofOfAddressType: string;
    proofOfAddressDate: string;
    verificationDate: string;
    notes?: string;
  }) => {
    setError(null);
    startTransition(async () => {
      const result = await recordManualIdVerification(assessmentId, actionId, data);
      if (!result.success) {
        setError(result.error);
      } else {
        setOptimisticCompleted(prev => { const next = new Set(prev); next.add(actionId); return next; });
        router.refresh();
      }
    });
  }, [assessmentId, router, startTransition]);

  const handleConfirmStillValid = useCallback((actionId: string) => {
    setError(null);
    setConfirmingAction(actionId);
    startTransition(async () => {
      const result = await confirmIdentityStillValid(assessmentId, actionId, lastCddVerifiedAt!, riskLevel || 'MEDIUM');
      setConfirmingAction(null);
      if (!result.success) {
        setError(result.error);
      } else {
        setOptimisticCompleted(prev => { const next = new Set(prev); next.add(actionId); return next; });
        router.refresh();
      }
    });
  }, [assessmentId, router, startTransition]);

  const handleDocumentConfirm = useCallback((actionId: string) => {
    setError(null);
    startTransition(async () => {
      const result = await confirmDocumentSaved(assessmentId, actionId);
      if (!result.success) {
        setError(result.error);
      } else {
        setOptimisticCompleted(prev => { const next = new Set(prev); next.add(actionId); return next; });
        router.refresh();
      }
    });
  }, [assessmentId, router, startTransition]);

  const handleInitiateAmiqus = useCallback((actionId: string, name: string, email: string) => {
    setError(null);
    startTransition(async () => {
      const result = await initiateAmiqusVerification(assessmentId, actionId, name, email);
      if (!result.success) setError(result.error);
      else router.refresh();
    });
  }, [assessmentId, router, startTransition]);

  const handleLinkAmiqus = useCallback((actionId: string, e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!linkRecordId) return;
    setError(null);
    startTransition(async () => {
      const result = await linkExistingAmiqusRecord(
        assessmentId,
        actionId,
        parseInt(linkRecordId, 10),
        linkOriginalDate || null
      );
      if (!result.success) {
        setError(result.error);
      } else {
        setOpenLinkAmiqus(null);
        setLinkRecordId('');
        setLinkOriginalDate('');
        setOptimisticCompleted(prev => { const next = new Set(prev); next.add(actionId); return next; });
        router.refresh();
      }
    });
  }, [assessmentId, linkRecordId, linkOriginalDate, router, startTransition]);

  const handleRequestApproval = useCallback(() => {
    setError(null);
    startTransition(async () => {
      const result = await requestMLROApproval(assessmentId);
      if (!result.success) setError(result.error);
      else router.refresh();
    });
  }, [assessmentId, router, startTransition]);

  const handleWithdrawApproval = useCallback(() => {
    if (!approvalStatus?.id) return;
    setError(null);
    startTransition(async () => {
      const result = await withdrawApproval(approvalStatus.id);
      if (!result.success) setError(result.error);
      else router.refresh();
    });
  }, [approvalStatus?.id, router, startTransition]);

  const handleDecideApproval = useCallback((decision: 'approved' | 'rejected', notes: string) => {
    if (!approvalStatus?.id) return;
    setError(null);
    startTransition(async () => {
      const result = await decideApproval(approvalStatus.id, decision, notes || undefined);
      if (!result.success) setError(result.error);
      else router.refresh();
    });
  }, [approvalStatus?.id, router, startTransition]);

  // ── Category grouping ──

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

  // Helper to count completed items in a list of actions
  const countCompleted = (acts: MandatoryAction[]): number => {
    return acts.filter(a => {
      const isApproval = a.actionId === 'senior_management_approval' || a.actionId === 'mlro_approval';
      const approvalDone = isApproval && approvalStatus?.status === 'approved';
      return optimisticCompleted.has(a.actionId) || approvalDone;
    }).length;
  };

  // ── Shared item props builder ──

  const renderItem = (action: MandatoryAction, num: number) => {
    const isApproval = action.actionId === 'senior_management_approval' || action.actionId === 'mlro_approval';
    const approvalDone = isApproval && approvalStatus?.status === 'approved';

    // Person list for items that enumerate directors / beneficial owners to verify.
    // Directors come from Companies House; beneficial owners are entered manually.
    let personList: string[] | null = null;
    let isBeneficialOwnerList = false;
    if (action.actionId === 'identify_and_verify_directors' && directorNames.length > 0) {
      personList = directorNames;
    } else if (action.actionId === 'identify_and_verify_beneficial_owners') {
      personList = beneficialOwnerNames.length > 0 ? beneficialOwnerNames : null;
      isBeneficialOwnerList = true;
    }

    return (
      <CDDChecklistItem
        key={action.actionId}
        action={action}
        num={num}
        personList={personList}
        isBeneficialOwnerList={isBeneficialOwnerList}
        assessmentId={assessmentId}
        isCompleted={optimisticCompleted.has(action.actionId)}
        approvalCompleted={approvalDone}
        itemEvidence={evidenceByAction.get(action.actionId) || []}
        progressRecord={progressByAction.get(action.actionId)}
        isPending={isPending}
        isFinalised={isFinalised}
        isCorporate={isCorporate}
        registeredNumber={registeredNumber}
        amiqusConfigured={amiqusConfigured}
        clientEmail={clientEmail}
        lastCddVerifiedAt={lastCddVerifiedAt}
        riskLevel={riskLevel}
        matterDescription={matterDescription}
        verifications={amiqusVerificationsByAction.get(action.actionId) || []}
        clientAmiqus={clientAmiqus}
        priorSowData={priorSowData}
        syncRecords={syncRecords}
        userNames={userNames}
        approvalStatus={isApproval ? approvalStatus : undefined}
        userRole={userRole}
        confirmingAction={confirmingAction}
        onToggle={handleToggle}
        onCHLookup={handleCHLookup}
        onFileUpload={handleFileUpload}
        onManualRecord={handleManualRecord}
        onManualIdv={handleManualIdv}
        onConfirmStillValid={handleConfirmStillValid}
        onDocumentConfirm={handleDocumentConfirm}
        onInitiateAmiqus={handleInitiateAmiqus}
        onLinkAmiqus={handleLinkAmiqus}
        onRequestApproval={handleRequestApproval}
        onWithdrawApproval={handleWithdrawApproval}
        onDecideApproval={handleDecideApproval}
        linkRecordId={linkRecordId}
        setLinkRecordId={setLinkRecordId}
        linkOriginalDate={linkOriginalDate}
        setLinkOriginalDate={setLinkOriginalDate}
        openLinkAmiqus={openLinkAmiqus}
        setOpenLinkAmiqus={setOpenLinkAmiqus}
      />
    );
  };

  let num = 0;

  return (
    <>
      {error && <div className={styles.evidenceError}>{error}</div>}

      {/* Non-EDD action groups */}
      <section className={styles.section}>
        <h2 className={styles.sectionTitle}>CDD Requirements</h2>
        {sortedCategories.map((category) => {
          const catActions = groupedActions[category];
          const completed = countCompleted(catActions);
          return (
            <div key={category} className={styles.cddCategory}>
              <div className={styles.categoryHeader}>
                <h3 className={styles.cddCategoryLabel}>
                  {CATEGORY_LABELS[category] || category.toUpperCase()}
                </h3>
                <span className={styles.categoryProgress}>
                  {completed}/{catActions.length} complete
                </span>
              </div>
              <div className={styles.columnHeaders}>
                <span>Requirement</span>
                <span>Evidence / Response</span>
                <span>Status</span>
              </div>
              {catActions.map((action) => {
                num++;
                return renderItem(action, num);
              })}
            </div>
          );
        })}
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
          <div className={styles.categoryHeader}>
            <h3 className={styles.cddCategoryLabel}>ENHANCED DUE DILIGENCE</h3>
            <span className={styles.categoryProgress}>
              {countCompleted(eddActions)}/{eddActions.length} complete
            </span>
          </div>
          <div className={styles.columnHeaders}>
            <span>Requirement</span>
            <span>Evidence / Response</span>
            <span>Status</span>
          </div>
          {eddActions.map((action) => {
            num++;
            return renderItem(action, num);
          })}
        </section>
      )}
    </>
  );
}
