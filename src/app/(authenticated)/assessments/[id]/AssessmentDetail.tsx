'use client';

/**
 * View Risk Assessment Scoring (Collapsible)
 *
 * Shows all questions asked in the risk assessment with answers,
 * risk factor scoring indicators (+N), and EDD trigger indicators.
 * Replaces the old "Assessment Detail" triggered-factors-only view.
 */

import { useState } from 'react';
import type { RiskFactorResult, EDDTriggerResult } from '@/lib/rules-engine/types';
import individualFormConfig from '@/config/eventus/forms/CMLRA_individual.json';
import corporateFormConfig from '@/config/eventus/forms/CMLRA_corporate.json';
import riskScoringConfig from '@/config/eventus/risk_scoring_v3_8.json';
import styles from './page.module.css';

interface AssessmentDetailProps {
  riskFactors: RiskFactorResult[];
  rationale: string[];
  assessmentId: string;
  timestamp: string;
  /** Form answers from input_snapshot */
  formAnswers: Record<string, string | string[]>;
  /** Client type (individual or corporate) */
  clientType: string;
  /** Risk level */
  riskLevel: string;
  /** Score */
  score: number;
  /** EDD triggers that fired */
  eddTriggers: EDDTriggerResult[];
}

interface FormField {
  id: string;
  type: string;
  label?: string | { value: string; options?: string[] };
  fields?: string[];
  show_if?: Record<string, string | string[]>;
}

function getFieldLabel(field: FormField): string {
  if (!field.label) return '';
  if (typeof field.label === 'string') return field.label;
  return field.label.value || '';
}

function formatAnswer(answer: string | string[] | undefined): string {
  if (!answer) return '—';
  if (Array.isArray(answer)) return answer.join(', ');
  return answer;
}

export function AssessmentDetail({
  riskFactors,
  formAnswers,
  clientType,
  riskLevel,
  score,
  eddTriggers,
}: AssessmentDetailProps) {
  const [expanded, setExpanded] = useState(false);

  const isIndividual = clientType === 'individual';
  const formConfig = isIndividual ? individualFormConfig : corporateFormConfig;
  const clientTypeKey = isIndividual ? 'individual' : 'corporate';

  // Build risk factor lookup by form field ID
  const riskFactorByField = new Map<string, RiskFactorResult>();
  for (const rf of riskFactors) {
    if (rf.formFieldId) riskFactorByField.set(rf.formFieldId, rf);
  }

  // Build EDD trigger lookup by form field ID
  const eddTriggerByField = new Map<string, string>();
  for (const trigger of (riskScoringConfig.eddTriggers || [])) {
    const fieldId = (trigger.fieldMapping as Record<string, string>)?.[clientTypeKey];
    if (fieldId) {
      // Check if this trigger actually fired
      const fired = eddTriggers.some(t => t.triggerId === trigger.id);
      if (fired) {
        eddTriggerByField.set(fieldId, trigger.description);
      }
    }
  }

  // Flatten form fields in display order
  const fieldMap = new Map<string, FormField>();
  for (const f of formConfig.fields as FormField[]) {
    fieldMap.set(f.id, f);
  }

  function isFieldVisible(field: FormField): boolean {
    if (!field.show_if) return true;
    for (const [depId, requiredValue] of Object.entries(field.show_if)) {
      const actual = formAnswers[depId];
      if (!actual) return false;
      if (Array.isArray(requiredValue)) {
        const actualStr = Array.isArray(actual) ? actual[0] : actual;
        if (!requiredValue.includes(actualStr)) return false;
      } else {
        const actualStr = Array.isArray(actual) ? actual[0] : actual;
        if (actualStr !== requiredValue) return false;
      }
    }
    return true;
  }

  // Walk form structure
  const rows: Array<{
    type: 'section' | 'question';
    label: string;
    answer?: string;
    riskScore?: number;
    eddTrigger?: string;
    fieldId?: string;
  }> = [];

  function walkSection(fieldIds: string[]) {
    for (const fid of fieldIds) {
      const field = fieldMap.get(fid);
      if (!field) continue;
      if (field.type === 'section') {
        if (field.label) rows.push({ type: 'section', label: typeof field.label === 'string' ? field.label : '' });
        if (field.fields) walkSection(field.fields);
      } else if (field.type !== 'rich_text') {
        if (!isFieldVisible(field)) continue;
        const label = getFieldLabel(field);
        if (!label) continue;
        const rf = riskFactorByField.get(fid);
        const eddDesc = eddTriggerByField.get(fid);
        rows.push({
          type: 'question',
          label,
          answer: formatAnswer(formAnswers[fid]),
          riskScore: rf && rf.score > 0 ? rf.score : undefined,
          eddTrigger: eddDesc,
          fieldId: fid,
        });
      }
    }
  }

  const rootSection = (formConfig.fields as FormField[]).find(f => f.type === 'section' && f.id === '1');
  if (rootSection?.fields) walkSection(rootSection.fields);

  return (
    <section className={styles.section}>
      <button
        type="button"
        className={styles.collapsibleHeader}
        onClick={() => setExpanded(!expanded)}
        aria-expanded={expanded}
      >
        <h2 className={styles.sectionTitle}>
          View Risk Assessment Scoring
        </h2>
        <span className={styles.expandIcon}>{expanded ? '\u25B2' : '\u25BC'}</span>
      </button>

      <div className={`${styles.collapsibleContent} ${expanded ? '' : styles.collapsibleContentHidden}`}>
        {/* Risk summary */}
        <div className={styles.scoringSummaryBar}>
          <span className={styles.scoringSummaryLevel} data-level={riskLevel}>
            {riskLevel} Risk
          </span>
          <span className={styles.scoringSummaryScore}>
            Score: {score}
            <span className={styles.scoringSummaryThreshold}>
              {riskLevel === 'LOW' && ' (0\u20134 = Low)'}
              {riskLevel === 'MEDIUM' && ' (5\u20138 = Medium)'}
              {riskLevel === 'HIGH' && ' (9+ = High)'}
            </span>
          </span>
        </div>

        {/* Questions and answers table */}
        <div className={styles.scoringQuestionsTable}>
          {rows.map((row, i) => {
            if (row.type === 'section') {
              return (
                <div key={i} className={styles.scoringSectionHeader}>
                  {row.label}
                </div>
              );
            }
            const hasIndicator = row.riskScore || row.eddTrigger;
            return (
              <div
                key={i}
                className={`${styles.scoringQuestionRow} ${row.riskScore ? styles.scoringQuestionScored : ''} ${row.eddTrigger ? styles.scoringQuestionEdd : ''}`}
              >
                <div className={styles.scoringQuestionLabel}>{row.label}</div>
                <div className={styles.scoringQuestionAnswer}>{row.answer}</div>
                <div className={styles.scoringQuestionIndicators}>
                  {row.riskScore && (
                    <span className={styles.scoringBadgeRisk}>+{row.riskScore}</span>
                  )}
                  {row.eddTrigger && (
                    <span className={styles.scoringBadgeEdd}>EDD</span>
                  )}
                  {!hasIndicator && <span />}
                </div>
              </div>
            );
          })}
        </div>

        {/* Risk factors summary */}
        {riskFactors.filter(f => f.score > 0).length > 0 && (
          <div style={{ marginTop: 'var(--space-4)' }}>
            <h3 className={styles.detailSubheading}>Risk Factors Triggered</h3>
            <div className={styles.scoringQuestionsTable}>
              <div className={styles.scoringFactorHeaderRow}>
                <span>Factor</span>
                <span>Answer</span>
                <span>Score</span>
              </div>
              {riskFactors.filter(f => f.score > 0).sort((a, b) => b.score - a.score).map((rf) => (
                <div key={rf.factorId} className={styles.scoringQuestionRow}>
                  <div className={styles.scoringQuestionLabel} style={{ fontWeight: 500 }}>{rf.factorLabel}</div>
                  <div className={styles.scoringQuestionAnswer}>{formatAnswer(rf.selectedAnswer)}</div>
                  <div className={styles.scoringQuestionIndicators}>
                    <span className={styles.scoringBadgeRisk}>+{rf.score}</span>
                  </div>
                </div>
              ))}
              <div className={styles.scoringTotalRow}>
                <span>Total Score</span>
                <span />
                <strong>{score}</strong>
              </div>
            </div>
          </div>
        )}

        {/* EDD triggers */}
        {eddTriggers.length > 0 && (
          <div style={{ marginTop: 'var(--space-4)' }}>
            <h3 className={styles.detailSubheading}>EDD Triggers</h3>
            <ul className={styles.rationaleList}>
              {eddTriggers.map((t) => (
                <li key={t.triggerId} className={styles.rationaleItem}>
                  {t.description} <span style={{ color: 'var(--text-muted)', fontSize: '0.75rem' }}>({t.authority})</span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </section>
  );
}
