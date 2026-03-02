'use client';

import { useState, useMemo, useCallback } from 'react';
import type { Json } from '@/lib/supabase/types';
import styles from '../wizard.module.css';

interface StepProps {
  initialData: Json;
  onSaveAndNext: (data: unknown) => void;
  onBack: () => void;
  saving: boolean;
}

/** Factor IDs that are mandatory per regulatory baseline and cannot be reduced. */
const MANDATORY_FACTOR_IDS = new Set([
  'pep_or_rca',
  'country_risk',
  'source_of_funds',
  'client_account_funds',
  'existing_or_new_client',
]);

const WEIGHT_LABELS: Record<number, string> = {
  0: 'Not significant',
  1: 'Minor',
  2: 'Significant',
  3: 'Critical',
};

interface FactorOption {
  answer: string;
  score?: number;
  outcome?: string;
}

interface Factor {
  id: string;
  label: string;
  authority?: string;
  scored?: boolean;
  options?: FactorOption[];
}

interface Section {
  label: string;
  factors: Factor[];
}

type ScoringFactors = Record<string, Record<string, Section>>;

function parseScoringFactors(data: Json): ScoringFactors {
  if (data && typeof data === 'object' && !Array.isArray(data)) {
    const d = data as Record<string, Json>;
    if (d.scoringFactors && typeof d.scoringFactors === 'object' && !Array.isArray(d.scoringFactors)) {
      return d.scoringFactors as unknown as ScoringFactors;
    }
  }
  return {};
}

/** Get the highest numeric score among a factor's options. */
function getMaxScore(factor: Factor): number {
  if (!factor.options) return 0;
  return factor.options.reduce((max, opt) => {
    const s = typeof opt.score === 'number' ? opt.score : 0;
    return s > max ? s : max;
  }, 0);
}

/**
 * Build a flat list of unique factors across both entity types,
 * deduplicating by factor ID (keeping the first occurrence).
 */
function collectUniqueFactors(scoringFactors: ScoringFactors): Factor[] {
  const seen = new Set<string>();
  const result: Factor[] = [];

  for (const entityType of ['individual', 'corporate']) {
    const sections = scoringFactors[entityType];
    if (!sections) continue;
    for (const sectionKey of Object.keys(sections)) {
      const section = sections[sectionKey];
      if (!section?.factors) continue;
      for (const factor of section.factors) {
        if (factor.scored === false) continue; // skip unscored context-only factors
        if (seen.has(factor.id)) continue;
        seen.add(factor.id);
        result.push(factor);
      }
    }
  }

  return result;
}

export function ScoringWeightsStep({ initialData, onSaveAndNext, onBack, saving }: StepProps) {
  const scoringFactors = useMemo(() => parseScoringFactors(initialData), [initialData]);
  const uniqueFactors = useMemo(() => collectUniqueFactors(scoringFactors), [scoringFactors]);

  // Track the user-chosen weight for each factor (keyed by factor ID).
  // Initialised to each factor's current max score.
  const [weights, setWeights] = useState<Record<string, number>>(() => {
    const initial: Record<string, number> = {};
    for (const f of uniqueFactors) {
      initial[f.id] = getMaxScore(f);
    }
    return initial;
  });

  const handleWeightChange = useCallback((factorId: string, value: number) => {
    setWeights((prev) => ({ ...prev, [factorId]: value }));
  }, []);

  function handleSave() {
    // Deep-clone the riskScoring config
    const updated = JSON.parse(JSON.stringify(initialData ?? {}));

    // Apply weight changes to all matching factors in both entity types
    const sf = updated.scoringFactors;
    if (sf && typeof sf === 'object') {
      for (const entityType of ['individual', 'corporate']) {
        const sections = sf[entityType];
        if (!sections || typeof sections !== 'object') continue;
        for (const sectionKey of Object.keys(sections)) {
          const section = sections[sectionKey];
          if (!section?.factors) continue;
          for (const factor of section.factors) {
            const chosenWeight = weights[factor.id];
            if (chosenWeight === undefined) continue;
            if (!factor.options) continue;

            // Scale each option's numeric score proportionally:
            // The highest option gets the chosen weight, others scale linearly.
            const currentMax = getMaxScore(factor);
            if (currentMax === 0) continue;

            for (const opt of factor.options) {
              if (typeof opt.score === 'number' && opt.score > 0) {
                opt.score = Math.round((opt.score / currentMax) * chosenWeight);
              }
            }
          }
        }
      }
    }

    onSaveAndNext(updated);
  }

  return (
    <div className={styles.stepCard}>
      <h2 className={styles.stepTitle}>Step 2: Scoring Weights</h2>
      <p className={styles.stepDescription}>
        Review the weight assigned to each risk factor. Mandatory factors required by
        regulation are locked and cannot be reduced. Adjust other factors to reflect
        your firm&apos;s risk priorities.
      </p>

      <table className={styles.configTable}>
        <thead>
          <tr>
            <th>Factor</th>
            <th>Current Max</th>
            <th>Weight</th>
          </tr>
        </thead>
        <tbody>
          {uniqueFactors.map((factor) => {
            const isMandatory = MANDATORY_FACTOR_IDS.has(factor.id);
            const currentMax = getMaxScore(factor);
            const chosenWeight = weights[factor.id] ?? currentMax;
            // Locked factors cannot go below their baseline max
            const minAllowed = isMandatory ? currentMax : 0;

            return (
              <tr key={factor.id} className={isMandatory ? styles.lockedRow : undefined}>
                <td>
                  {factor.label}
                  {isMandatory && (
                    <>
                      {' '}
                      <span className={styles.lockedBadge}>Locked</span>
                      {factor.authority && (
                        <span className={styles.authorityRef}> {factor.authority}</span>
                      )}
                    </>
                  )}
                </td>
                <td>{currentMax}</td>
                <td>
                  {isMandatory ? (
                    <span>{WEIGHT_LABELS[chosenWeight] ?? chosenWeight} ({chosenWeight})</span>
                  ) : (
                    <select
                      className={styles.formSelect}
                      value={chosenWeight}
                      onChange={(e) => handleWeightChange(factor.id, Number(e.target.value))}
                    >
                      {[0, 1, 2, 3]
                        .filter((v) => v >= minAllowed)
                        .map((v) => (
                          <option key={v} value={v}>
                            {WEIGHT_LABELS[v]} ({v})
                          </option>
                        ))}
                    </select>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>

      <div className={styles.navigation}>
        <button
          type="button"
          className={styles.navButtonSecondary}
          onClick={onBack}
          disabled={saving}
        >
          Back
        </button>
        <button
          type="button"
          className={styles.navButtonPrimary}
          onClick={handleSave}
          disabled={saving}
        >
          {saving ? 'Saving...' : 'Save & Continue'}
        </button>
      </div>
    </div>
  );
}

