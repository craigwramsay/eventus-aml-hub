'use client';

/**
 * Collapsible Assessment Detail Section
 *
 * Shows triggered risk factors, rationale, and metadata.
 * Hidden by default — expands on click.
 */

import { useState } from 'react';
import type { RiskFactorResult } from '@/lib/rules-engine/types';
import styles from './page.module.css';

interface AssessmentDetailProps {
  riskFactors: RiskFactorResult[];
  rationale: string[];
  assessmentId: string;
  timestamp: string;
}

export function AssessmentDetail({
  riskFactors,
  rationale,
  assessmentId,
  timestamp,
}: AssessmentDetailProps) {
  const [expanded, setExpanded] = useState(false);
  const triggeredFactors = riskFactors.filter((f) => f.score > 0);

  return (
    <section className={styles.section}>
      <button
        type="button"
        className={styles.collapsibleHeader}
        onClick={() => setExpanded(!expanded)}
        aria-expanded={expanded}
      >
        <h2 className={styles.sectionTitle}>
          Assessment Detail
        </h2>
        <span className={styles.expandIcon}>{expanded ? '\u25B2' : '\u25BC'}</span>
      </button>

      {expanded && (
        <div className={styles.collapsibleContent}>
          {/* Triggered Risk Factors */}
          <h3 className={styles.detailSubheading}>
            Triggered Risk Factors ({triggeredFactors.length})
          </h3>
          {triggeredFactors.length === 0 ? (
            <p className={styles.detailEmpty}>No risk factors triggered.</p>
          ) : (
            <ul className={styles.factorList}>
              {triggeredFactors
                .sort((a, b) => b.score - a.score || a.factorId.localeCompare(b.factorId))
                .map((factor) => (
                  <li key={factor.factorId} className={styles.factorItem}>
                    <div className={styles.factorHeader}>
                      <span className={styles.factorLabel}>{factor.factorLabel}</span>
                      <span className={styles.factorScore}>+{factor.score}</span>
                    </div>
                    <div className={styles.factorAnswer}>
                      Answer: {Array.isArray(factor.selectedAnswer) ? factor.selectedAnswer.join(', ') : factor.selectedAnswer}
                    </div>
                    {factor.rationale && (
                      <div className={styles.factorRationale}>{factor.rationale}</div>
                    )}
                  </li>
                ))}
            </ul>
          )}

          {/* Rationale */}
          <h3 className={styles.detailSubheading}>Rationale</h3>
          <ul className={styles.rationaleList}>
            {rationale
              .map((item) => item.replace(/^\s*-\s*/, '').trim())
              .filter((text) => text !== '')
              .map((text, index) => {
                // "Contributing risk factors:" is a sub-label, not a list item
                if (text === 'Contributing risk factors:') {
                  return (
                    <li key={index} className={styles.rationaleItem} style={{ listStyle: 'none', fontWeight: 600, marginLeft: '-1.25rem' }}>
                      {text}
                    </li>
                  );
                }
                return (
                  <li key={index} className={styles.rationaleItem}>
                    {text}
                  </li>
                );
              })}
          </ul>

          {/* Metadata */}
          <div className={styles.metadata}>
            <p>Assessment ID: {assessmentId}</p>
            <p>Assessed at: {timestamp}</p>
          </div>
        </div>
      )}
    </section>
  );
}
