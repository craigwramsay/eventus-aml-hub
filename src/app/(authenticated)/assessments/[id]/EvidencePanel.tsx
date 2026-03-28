'use client';

import { useState } from 'react';
import type { AssessmentEvidence, CddItemProgress, ClioDriveSync } from '@/lib/supabase/types';
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
    month: 'short',
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
}

export function EvidencePanel({
  evidence,
  progressRecord,
  isCompleted,
  isApprovalAction,
  syncRecords,
  userNames,
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

  if (evidence.length === 0 && !isCompleted) return null;
  if (evidence.length === 0 && isCompleted && isApprovalAction) return null;

  return (
    <div className={styles.evidenceSection}>
      {evidence.map((ev) => {
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

        // File uploads and manual records
        const badgeClass = ev.evidence_type === 'file_upload'
          ? styles.evidenceTypeBadgeFile
          : styles.evidenceTypeBadgeRecord;
        const badgeLabel = ev.evidence_type === 'file_upload' ? 'File' : 'Record';

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

      {/* Completion attribution when no evidence */}
      {isCompleted && evidence.length === 0 && !isApprovalAction && progressRecord?.completed_at && (
        <div className={styles.completionAttribution}>
          Marked complete{progressRecord.completed_by && userNames[progressRecord.completed_by]
            ? ` by ${userNames[progressRecord.completed_by]}`
            : ''} on {formatDate(progressRecord.completed_at)}
        </div>
      )}
    </div>
  );
}
