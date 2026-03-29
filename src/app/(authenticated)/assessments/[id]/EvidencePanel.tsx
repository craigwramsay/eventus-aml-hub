'use client';

import { useState } from 'react';
import type { AssessmentEvidence, CddItemProgress, AmiqusVerification, ClioDriveSync } from '@/lib/supabase/types';
import { SOW_INDIVIDUAL_FIELDS, SOW_CORPORATE_FIELDS, SOF_FIELDS } from '@/lib/clio/sow-sof-html';
import { CompaniesHouseCard } from './CompaniesHouseCard';
import { ClioDriveSyncBadge } from './ClioDriveSyncBadge';
import styles from './page.module.css';

/** Build a lookup map from field IDs to human-readable labels */
const DECLARATION_FIELD_LABELS: Record<string, string> = Object.fromEntries(
  [...SOW_INDIVIDUAL_FIELDS, ...SOW_CORPORATE_FIELDS, ...SOF_FIELDS].map(f => [f.id, f.label])
);

function getFieldLabel(fieldId: string): string {
  return DECLARATION_FIELD_LABELS[fieldId] || DECLARATION_FIELD_LABELS[fieldId.toLowerCase()] || fieldId;
}

function formatDateShort(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
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

interface EvidencePanelProps {
  evidence: AssessmentEvidence[];
  progressRecord?: CddItemProgress;
  isCompleted: boolean;
  isApprovalAction: boolean;
  syncRecords: ClioDriveSync[];
  userNames: Record<string, string>;
  /** Amiqus verification for this action (merged into evidence list) */
  verification?: AmiqusVerification;
  /** Client's latest Amiqus verification from a prior assessment (carry-forward) */
  clientAmiqus?: { amiqusRecordId: number; amiqusClientId: number | null; verifiedAt: string | null } | null;
}

export function EvidencePanel({
  evidence,
  progressRecord,
  isCompleted,
  isApprovalAction,
  syncRecords,
  userNames,
  verification,
  clientAmiqus,
}: EvidencePanelProps) {
  const [expandedEvidence, setExpandedEvidence] = useState<Set<string>>(new Set());

  const toggleExpanded = (id: string) => {
    setExpandedEvidence(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  // Determine if there's Amiqus info to show
  const hasAmiqus = verification || (clientAmiqus && isCompleted);

  // Check if identity was carried forward (user relied on existing verification)
  const carryForwardEvidence = evidence.find(ev => ev.label === 'Prior identity verification confirmed still valid');
  const hasCarryForward = !!carryForwardEvidence;

  if (evidence.length === 0 && !hasAmiqus) return null;

  return (
    <div className={styles.evidenceSection}>
      {/* Amiqus verification — shown as first evidence line */}
      {hasAmiqus && (() => {
        if (verification?.status === 'complete') {
          const amiqusUrl = verification.amiqus_client_id
            ? `https://id.amiqus.co/clients/${verification.amiqus_client_id}`
            : 'https://id.amiqus.co/';
          const verifiedDate = verification.verified_at
            ? formatDateShort(verification.verified_at + 'T00:00:00')
            : null;
          const confirmedDate = carryForwardEvidence?.created_at
            ? formatDateShort(carryForwardEvidence.created_at)
            : null;
          return (
            <div>
              <div className={styles.evidenceLine}>
                <span className={`${styles.evidenceTypeBadge} ${styles.evidenceTypeBadgeAmiqus}`}>Amiqus</span>
                <span className={styles.evidenceLineLabel}>
                  {hasCarryForward
                    ? `Identity verified electronically — existing Amiqus verification dated ${verifiedDate || 'unknown'} was confirmed as still valid for this assessment${confirmedDate ? ` on ${confirmedDate}` : ''}`
                    : `Identity verified electronically${verifiedDate ? ` on ${verifiedDate}` : ''}`
                  }
                </span>
                <a href={amiqusUrl} target="_blank" rel="noopener noreferrer" className={styles.evidenceDetailToggle}>
                  View in Amiqus
                </a>
              </div>
            </div>
          );
        }
        if (verification?.status === 'pending' || verification?.status === 'in_progress') {
          const amiqusUrl = verification.amiqus_client_id
            ? `https://id.amiqus.co/clients/${verification.amiqus_client_id}`
            : 'https://id.amiqus.co/';
          return (
            <div className={styles.evidenceLine}>
              <span className={`${styles.evidenceTypeBadge} ${styles.evidenceTypeBadgePending}`}>
                {verification.status === 'pending' ? 'Pending' : 'In Progress'}
              </span>
              <span className={styles.evidenceLineLabel}>
                Electronic identity verification
              </span>
              <a href={amiqusUrl} target="_blank" rel="noopener noreferrer" className={styles.evidenceDetailToggle}>
                View in Amiqus
              </a>
            </div>
          );
        }
        if (verification?.status === 'failed' || verification?.status === 'expired') {
          return (
            <div className={styles.evidenceLine}>
              <span className={`${styles.evidenceTypeBadge} ${styles.evidenceTypeBadgeFailed}`}>
                {verification.status === 'failed' ? 'Failed' : 'Expired'}
              </span>
              <span className={styles.evidenceLineLabel}>Electronic identity verification</span>
            </div>
          );
        }
        // Carry-forward from prior assessment
        if (!verification && clientAmiqus && isCompleted) {
          const amiqusUrl = clientAmiqus.amiqusClientId
            ? `https://id.amiqus.co/clients/${clientAmiqus.amiqusClientId}`
            : `https://id.amiqus.co/`;
          const verifiedDate = clientAmiqus.verifiedAt
            ? formatDateShort(clientAmiqus.verifiedAt + 'T00:00:00')
            : null;
          const confirmedDate = carryForwardEvidence?.created_at
            ? formatDateShort(carryForwardEvidence.created_at)
            : null;
          return (
            <div>
              <div className={styles.evidenceLine}>
                <span className={`${styles.evidenceTypeBadge} ${styles.evidenceTypeBadgeAmiqus}`}>Amiqus</span>
                <span className={styles.evidenceLineLabel}>
                  Identity verified electronically — existing Amiqus verification dated {verifiedDate || 'unknown'} was confirmed as still valid for this assessment{confirmedDate ? ` on ${confirmedDate}` : ''}
                </span>
                <a href={amiqusUrl} target="_blank" rel="noopener noreferrer" className={styles.evidenceDetailToggle}>
                  View in Amiqus
                </a>
              </div>
            </div>
          );
        }
        return null;
      })()}

      {/* Evidence items */}
      {evidence.filter(ev => {
        // When Amiqus line is showing, hide the carry-forward manual record
        // (the "Existing verification confirmed still valid" note replaces it)
        if (hasAmiqus && ev.label === 'Prior identity verification confirmed still valid') return false;
        return true;
      }).map((ev) => {
        const isExpanded = expandedEvidence.has(ev.id);

        if (ev.evidence_type === 'companies_house') {
          const isCarriedForward = ev.source === 'Carried forward';
          const chData = ev.data as Record<string, unknown> | null;
          const companyName = chData?.company_name as string | undefined;
          return (
            <div key={ev.id}>
              <div className={styles.evidenceLine}>
                <span className={`${styles.evidenceTypeBadge} ${styles.evidenceTypeBadgeCH}`}>CH</span>
                <span className={styles.evidenceLineLabel}>
                  {companyName || 'Companies House lookup'}
                  {isCarriedForward && ' (carried forward)'}
                </span>
                <span className={styles.evidenceLineDate}>{formatDateShort(ev.created_at)}</span>
                <button
                  type="button"
                  className={styles.evidenceDetailToggle}
                  onClick={() => toggleExpanded(ev.id)}
                >
                  {isExpanded ? 'Hide' : 'Details'}
                </button>
              </div>
              {isExpanded && (
                <div className={styles.evidenceDetailPanel}>
                  <CompaniesHouseCard evidence={ev} />
                  {syncRecords.length > 0 && (
                    <ClioDriveSyncBadge evidenceId={ev.id} syncRecords={syncRecords} />
                  )}
                </div>
              )}
            </div>
          );
        }

        if (ev.evidence_type === 'sow_declaration' || ev.evidence_type === 'sof_declaration') {
          const data = ev.data as Record<string, string | string[]> | null;
          const summaryText = data ? (() => {
            for (const value of Object.values(data)) {
              const text = Array.isArray(value) ? value.join(', ') : String(value);
              if (text.trim()) return text.length > 60 ? text.slice(0, 57) + '...' : text;
            }
            return null;
          })() : null;
          return (
            <div key={ev.id}>
              <div className={styles.evidenceLine}>
                <span className={`${styles.evidenceTypeBadge} ${styles.evidenceTypeBadgeDeclaration}`}>Declaration</span>
                <span className={styles.evidenceLineLabel}>{ev.label}</span>
                <span className={styles.evidenceLineDate}>{formatDateShort(ev.created_at)}</span>
                {data && (
                  <button
                    type="button"
                    className={styles.evidenceDetailToggle}
                    onClick={() => toggleExpanded(ev.id)}
                  >
                    {isExpanded ? 'Hide' : 'Details'}
                  </button>
                )}
              </div>
              {!isExpanded && summaryText && (
                <div className={styles.evidenceLineNotes}>{summaryText}</div>
              )}
              {isExpanded && data && (
                <div className={styles.evidenceDetailPanel}>
                  <div className={styles.chGrid}>
                    {Object.entries(data).map(([key, value]) => (
                      <div key={key} className={styles.chField}>
                        <span className={styles.chFieldLabel}>{getFieldLabel(key)}</span>
                        <span>{Array.isArray(value) ? value.join(', ') : String(value)}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          );
        }

        // Manual identity verification (photo ID + proof of address)
        if (ev.label?.startsWith('Identity verified:')) {
          const idvData = ev.data as { photoIdType?: string; proofOfAddressType?: string; proofOfAddressDate?: string; verificationDate?: string } | null;
          return (
            <div key={ev.id}>
              <div className={styles.evidenceLine}>
                <span className={`${styles.evidenceTypeBadge} ${styles.evidenceTypeBadgeAmiqus}`}>ID&V</span>
                <span className={styles.evidenceLineLabel}>
                  Identity verified manually
                </span>
                {ev.verified_at && (
                  <span className={styles.evidenceLineDate}>
                    Verified {formatDateShort(ev.verified_at + 'T00:00:00')}
                  </span>
                )}
              </div>
              <div className={styles.evidenceLineNotes}>
                {idvData?.photoIdType} + {idvData?.proofOfAddressType}
                {idvData?.proofOfAddressDate && ` (dated ${formatDateShort(idvData.proofOfAddressDate + 'T00:00:00')})`}
              </div>
            </div>
          );
        }

        // Carry-forward confirmation (when no Amiqus lookup available) — clean single line
        if (ev.label === 'Prior identity verification confirmed still valid') {
          return (
            <div key={ev.id}>
              <div className={styles.evidenceLine}>
                <span className={`${styles.evidenceTypeBadge} ${styles.evidenceTypeBadgeRecord}`}>Verified</span>
                <span className={styles.evidenceLineLabel}>
                  Identity verified electronically
                </span>
                {ev.verified_at && (
                  <span className={styles.evidenceLineDate}>
                    Verified {formatDateShort(ev.verified_at + 'T00:00:00')}
                  </span>
                )}
              </div>
              <div className={styles.evidenceLineNotes}>
                Existing verification confirmed still valid for this assessment
              </div>
            </div>
          );
        }

        // File uploads and manual records — compact single line
        const badgeClass = ev.evidence_type === 'file_upload'
          ? styles.evidenceTypeBadgeFile
          : styles.evidenceTypeBadgeRecord;
        const badgeLabel = ev.evidence_type === 'file_upload' ? 'File' : 'Note';

        return (
          <div key={ev.id}>
            <div className={styles.evidenceLine}>
              <span className={`${styles.evidenceTypeBadge} ${badgeClass}`}>{badgeLabel}</span>
              <span className={styles.evidenceLineLabel}>{ev.label}</span>
              {ev.verified_at && (
                <span className={styles.evidenceLineVerified}>
                  Verified: {formatDateShort(ev.verified_at + 'T00:00:00')}
                </span>
              )}
              <span className={styles.evidenceLineDate}>{formatDateShort(ev.created_at)}</span>
              {syncRecords.length > 0 && (
                <ClioDriveSyncBadge evidenceId={ev.id} syncRecords={syncRecords} />
              )}
            </div>
            {ev.notes && (
              <div className={styles.evidenceLineNotes}>{ev.notes}</div>
            )}
          </div>
        );
      })}

      {/* Completion attribution moved to status bar in CDDChecklistItem */}
    </div>
  );
}
