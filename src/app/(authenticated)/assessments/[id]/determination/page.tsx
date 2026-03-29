/**
 * View Risk Assessment Page
 *
 * Shows all questions asked in the risk assessment with the answers given,
 * cross-referenced with risk factor scoring. Replaces the old plain-text
 * scoring breakdown.
 *
 * Route: /assessments/[id]/determination
 */

import Link from 'next/link';
import { getAssessment } from '@/app/actions/assessments';
import individualFormConfig from '@/config/eventus/forms/CMLRA_individual.json';
import corporateFormConfig from '@/config/eventus/forms/CMLRA_corporate.json';
import styles from './page.module.css';

interface PageProps {
  params: Promise<{ id: string }>;
}

interface FormField {
  id: string;
  type: string;
  label?: string | { value: string; options?: string[] };
  fields?: string[];
  show_if?: Record<string, string | string[]>;
  hint?: string;
}

interface RiskFactor {
  factorId: string;
  factorLabel: string;
  formFieldId: string;
  selectedAnswer: string | string[];
  score: number;
  rationale: string;
}

/** Extract the display label from a form field */
function getFieldLabel(field: FormField): string {
  if (!field.label) return '';
  if (typeof field.label === 'string') return field.label;
  return field.label.value || '';
}

/** Flatten nested section structure to get all answerable fields in order */
function flattenFields(fields: FormField[]): FormField[] {
  const fieldMap = new Map<string, FormField>();
  for (const f of fields) {
    fieldMap.set(f.id, f);
  }

  const result: FormField[] = [];
  const rootSection = fields.find(f => f.type === 'section' && f.id === '1');
  if (!rootSection?.fields) return fields.filter(f => f.type !== 'section');

  function walkSection(sectionFieldIds: string[]) {
    for (const id of sectionFieldIds) {
      const field = fieldMap.get(id);
      if (!field) continue;
      if (field.type === 'section') {
        result.push(field); // Add section header
        if (field.fields) walkSection(field.fields);
      } else {
        result.push(field);
      }
    }
  }

  walkSection(rootSection.fields);
  return result;
}

/** Format an answer for display */
function formatAnswer(answer: string | string[] | undefined): string {
  if (!answer) return '—';
  if (Array.isArray(answer)) return answer.join(', ');
  return answer;
}

export default async function ViewRiskAssessmentPage({ params }: PageProps) {
  const { id } = await params;
  const assessment = await getAssessment(id);

  if (!assessment) {
    return (
      <div className={styles.errorContainer}>
        <h1 className={styles.errorTitle}>Assessment Not Found</h1>
        <p className={styles.errorMessage}>
          The assessment could not be found or you do not have access.
        </p>
        <Link href="/assessments" className={styles.backLink}>
          Return to assessments
        </Link>
      </div>
    );
  }

  const inputSnapshot = assessment.input_snapshot as unknown as {
    clientType: string;
    formAnswers: Record<string, string | string[]>;
    jurisdiction?: string;
  };
  const outputSnapshot = assessment.output_snapshot as unknown as {
    score: number;
    riskLevel: string;
    riskFactors: RiskFactor[];
    rationale: string[];
  };

  const isFinalised = assessment.finalised_at !== null;
  const isIndividual = inputSnapshot.clientType === 'individual';
  const formConfig = isIndividual ? individualFormConfig : corporateFormConfig;
  const formAnswers = inputSnapshot.formAnswers || {};

  // Build a map of formFieldId -> riskFactor for scoring cross-reference
  const riskFactorByField = new Map<string, RiskFactor>();
  for (const rf of outputSnapshot.riskFactors || []) {
    if (rf.formFieldId) riskFactorByField.set(rf.formFieldId, rf);
  }

  // Flatten form fields in display order
  const orderedFields = flattenFields(formConfig.fields as FormField[]);

  // Check if a conditional field should be visible based on answers
  function isFieldVisible(field: FormField): boolean {
    if (!field.show_if) return true;
    for (const [depId, requiredValue] of Object.entries(field.show_if)) {
      const actual = formAnswers[depId];
      if (!actual) return false;
      if (Array.isArray(requiredValue)) {
        // Field shows if the answer matches any of the required values
        const actualStr = Array.isArray(actual) ? actual[0] : actual;
        if (!requiredValue.includes(actualStr)) return false;
      } else {
        const actualStr = Array.isArray(actual) ? actual[0] : actual;
        if (actualStr !== requiredValue) return false;
      }
    }
    return true;
  }

  return (
    <>
      <Link href={`/assessments/${id}`} className={styles.backLink}>
        &larr; Back to Assessment
      </Link>

      <div className={styles.header}>
        <div className={styles.headerLeft}>
          <h1 className={styles.title}>
            Risk Assessment
            <span
              className={`${styles.statusBadge} ${isFinalised ? styles.statusFinalised : styles.statusDraft}`}
            >
              {isFinalised ? 'Finalised' : 'Draft'}
            </span>
          </h1>
          <p className={styles.subtitle}>
            {assessment.reference} &middot; {isIndividual ? 'Individual' : 'Corporate'} client
          </p>
        </div>
      </div>

      {/* Risk summary */}
      <div className={styles.riskSummary}>
        <div className={styles.riskSummaryLevel} data-level={assessment.risk_level}>
          {assessment.risk_level} Risk
        </div>
        <div className={styles.riskSummaryScore}>
          Score: {assessment.score}
          <span className={styles.riskSummaryThreshold}>
            {assessment.risk_level === 'LOW' && ' (0–4 = Low)'}
            {assessment.risk_level === 'MEDIUM' && ' (5–8 = Medium)'}
            {assessment.risk_level === 'HIGH' && ' (9+ = High)'}
          </span>
        </div>
      </div>

      {/* Questions and answers */}
      <section className={styles.questionsSection}>
        <h2 className={styles.sectionTitle}>Questions and Answers</h2>
        <div className={styles.questionsTable}>
          {orderedFields.map((field) => {
            // Section headers
            if (field.type === 'section') {
              return (
                <div key={field.id} className={styles.sectionHeader}>
                  {typeof field.label === 'string' ? field.label : ''}
                </div>
              );
            }

            // Skip non-answerable fields (rich_text info blocks)
            if (field.type === 'rich_text' || field.type === 'json_content') return null;

            // Skip fields not visible due to conditional logic
            if (!isFieldVisible(field)) return null;

            const label = getFieldLabel(field);
            if (!label) return null;

            const answer = formAnswers[field.id];
            const riskFactor = riskFactorByField.get(field.id);
            const hasScoring = riskFactor && riskFactor.score > 0;

            return (
              <div
                key={field.id}
                className={`${styles.questionRow} ${hasScoring ? styles.questionRowScored : ''}`}
              >
                <div className={styles.questionLabel}>{label}</div>
                <div className={styles.questionAnswer}>
                  {formatAnswer(answer)}
                </div>
                <div className={styles.questionScore}>
                  {hasScoring && (
                    <span className={styles.scoreBadge}>+{riskFactor.score}</span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </section>

      {/* Scoring breakdown */}
      {outputSnapshot.riskFactors && outputSnapshot.riskFactors.length > 0 && (
        <section className={styles.questionsSection}>
          <h2 className={styles.sectionTitle}>Risk Factors Triggered</h2>
          <div className={styles.questionsTable}>
            <div className={styles.factorHeaderRow}>
              <div className={styles.factorHeaderLabel}>Factor</div>
              <div className={styles.factorHeaderAnswer}>Answer</div>
              <div className={styles.factorHeaderScore}>Score</div>
            </div>
            {outputSnapshot.riskFactors.map((rf) => (
              <div key={rf.factorId} className={styles.factorRow}>
                <div className={styles.factorLabel}>{rf.factorLabel}</div>
                <div className={styles.factorAnswer}>{formatAnswer(rf.selectedAnswer)}</div>
                <div className={styles.factorScore}>
                  <span className={styles.scoreBadge}>+{rf.score}</span>
                </div>
              </div>
            ))}
            <div className={styles.factorTotalRow}>
              <div className={styles.factorLabel}>Total Score</div>
              <div className={styles.factorAnswer}></div>
              <div className={styles.factorScore}>
                <strong>{assessment.score}</strong>
              </div>
            </div>
          </div>
        </section>
      )}

      {/* Rationale */}
      {outputSnapshot.rationale && outputSnapshot.rationale.length > 0 && (
        <section className={styles.questionsSection}>
          <h2 className={styles.sectionTitle}>Assessment Rationale</h2>
          <ul className={styles.rationaleList}>
            {outputSnapshot.rationale.map((line, i) => (
              <li key={i}>{line}</li>
            ))}
          </ul>
        </section>
      )}
    </>
  );
}
