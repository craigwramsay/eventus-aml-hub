'use client';

import { useState, useMemo } from 'react';
import type { Json } from '@/lib/supabase/types';
import styles from '../wizard.module.css';

interface StepProps {
  initialData: Json;
  onSaveAndNext: (data: unknown) => void;
  onBack: () => void;
  saving: boolean;
}

interface Thresholds {
  LOW: { min: number; max: number | null };
  MEDIUM: { min: number; max: number | null };
  HIGH: { min: number; max: number | null };
}

function parseThresholds(data: Json): { mediumMin: number; highMin: number } {
  if (data && typeof data === 'object' && !Array.isArray(data)) {
    const thresholds = (data as Record<string, Json>).thresholds;
    if (thresholds && typeof thresholds === 'object' && !Array.isArray(thresholds)) {
      const t = thresholds as Record<string, Json>;
      const medium = t.MEDIUM;
      const high = t.HIGH;
      if (medium && typeof medium === 'object' && !Array.isArray(medium)) {
        const mediumObj = medium as Record<string, Json>;
        if (high && typeof high === 'object' && !Array.isArray(high)) {
          const highObj = high as Record<string, Json>;
          return {
            mediumMin: typeof mediumObj.min === 'number' ? mediumObj.min : 5,
            highMin: typeof highObj.min === 'number' ? highObj.min : 9,
          };
        }
      }
    }
  }
  return { mediumMin: 5, highMin: 9 };
}

export function RiskAppetiteStep({ initialData, onSaveAndNext, onBack, saving }: StepProps) {
  const defaults = useMemo(() => parseThresholds(initialData), [initialData]);
  const [mediumMin, setMediumMin] = useState(defaults.mediumMin);
  const [highMin, setHighMin] = useState(defaults.highMin);

  const validationError = useMemo(() => {
    if (mediumMin >= highMin) {
      return 'MEDIUM threshold must be less than HIGH threshold.';
    }
    return null;
  }, [mediumMin, highMin]);

  const thresholds: Thresholds = useMemo(() => ({
    LOW: { min: 0, max: mediumMin - 1 },
    MEDIUM: { min: mediumMin, max: highMin - 1 },
    HIGH: { min: highMin, max: null },
  }), [mediumMin, highMin]);

  function handleSave() {
    if (validationError) return;

    // Clone the full riskScoring object and update only thresholds
    const updated = JSON.parse(JSON.stringify(initialData ?? {}));
    updated.thresholds = {
      LOW: { min: 0, max: mediumMin - 1 },
      MEDIUM: { min: mediumMin, max: highMin - 1 },
      HIGH: { min: highMin, max: null },
    };
    onSaveAndNext(updated);
  }

  return (
    <div className={styles.stepCard}>
      <h2 className={styles.stepTitle}>Step 1: Risk Appetite Thresholds</h2>
      <p className={styles.stepDescription}>
        Configure the score boundaries that determine LOW, MEDIUM, and HIGH risk
        classifications. These thresholds define your firm&apos;s risk appetite.
      </p>

      <div className={styles.formGroup}>
        <div className={styles.sliderGroup}>
          <div className={styles.sliderLabel}>
            <label className={styles.formLabel}>
              At what score should MEDIUM begin?
            </label>
            <span className={styles.sliderValue}>{mediumMin}</span>
          </div>
          <p className={styles.formHint}>
            Scores from 0 to {mediumMin - 1} will be classified as LOW risk.
          </p>
          <input
            type="range"
            className={styles.slider}
            min={3}
            max={7}
            value={mediumMin}
            onChange={(e) => setMediumMin(Number(e.target.value))}
          />
        </div>

        <div className={styles.sliderGroup}>
          <div className={styles.sliderLabel}>
            <label className={styles.formLabel}>
              At what score should HIGH begin?
            </label>
            <span className={styles.sliderValue}>{highMin}</span>
          </div>
          <p className={styles.formHint}>
            Scores from {mediumMin} to {highMin - 1} will be classified as MEDIUM risk.
          </p>
          <input
            type="range"
            className={styles.slider}
            min={6}
            max={12}
            value={highMin}
            onChange={(e) => setHighMin(Number(e.target.value))}
          />
        </div>
      </div>

      {/* Threshold ranges preview */}
      <div className={styles.formGroup}>
        <label className={styles.formLabel}>Resulting Threshold Ranges</label>
        <table className={styles.configTable}>
          <thead>
            <tr>
              <th>Risk Level</th>
              <th>Score Range</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>LOW</td>
              <td>0 &ndash; {thresholds.LOW.max}</td>
            </tr>
            <tr>
              <td>MEDIUM</td>
              <td>{thresholds.MEDIUM.min} &ndash; {thresholds.MEDIUM.max}</td>
            </tr>
            <tr>
              <td>HIGH</td>
              <td>{thresholds.HIGH.min}+</td>
            </tr>
          </tbody>
        </table>
      </div>

      {validationError && (
        <p style={{ color: 'var(--status-high-text)', fontSize: '0.875rem', marginBottom: 'var(--space-3)' }}>
          {validationError}
        </p>
      )}

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
          disabled={saving || !!validationError}
        >
          {saving ? 'Saving...' : 'Save & Continue'}
        </button>
      </div>
    </div>
  );
}
