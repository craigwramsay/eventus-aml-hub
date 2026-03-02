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

/** Baseline maximum thresholds (months). Firms can only set equal or stricter (lower). */
const BASELINE_MAXIMUMS: Record<string, number> = {
  HIGH: 12,
  MEDIUM: 24,
  LOW: 36,
};

const RISK_LEVELS = ['HIGH', 'MEDIUM', 'LOW'] as const;

interface ThresholdConfig {
  months: number;
  label: string;
}

function parseThresholds(data: Json): Record<string, ThresholdConfig> {
  const defaults: Record<string, ThresholdConfig> = {
    HIGH: { months: 12, label: 'High-risk clients' },
    MEDIUM: { months: 24, label: 'Medium-risk clients' },
    LOW: { months: 36, label: 'Low-risk clients' },
  };

  if (!data || typeof data !== 'object' || Array.isArray(data)) {
    return defaults;
  }

  const d = data as Record<string, Json>;
  const thresholds = d.thresholds;

  if (!thresholds || typeof thresholds !== 'object' || Array.isArray(thresholds)) {
    return defaults;
  }

  const t = thresholds as Record<string, Json>;
  const result: Record<string, ThresholdConfig> = {};

  for (const level of RISK_LEVELS) {
    const levelConfig = t[level];
    if (levelConfig && typeof levelConfig === 'object' && !Array.isArray(levelConfig)) {
      const lc = levelConfig as Record<string, Json>;
      result[level] = {
        months: typeof lc.months === 'number' ? lc.months : defaults[level].months,
        label: typeof lc.label === 'string' ? lc.label : defaults[level].label,
      };
    } else {
      result[level] = defaults[level];
    }
  }

  return result;
}

export function CDDStalenessStep({ initialData, onSaveAndNext, onBack, saving }: StepProps) {
  const parsed = useMemo(() => parseThresholds(initialData), [initialData]);

  const [months, setMonths] = useState<Record<string, number>>(() => {
    const initial: Record<string, number> = {};
    for (const level of RISK_LEVELS) {
      initial[level] = parsed[level].months;
    }
    return initial;
  });

  const validationErrors = useMemo(() => {
    const errors: Record<string, string | null> = {};
    for (const level of RISK_LEVELS) {
      const value = months[level];
      const max = BASELINE_MAXIMUMS[level];
      if (value > max) {
        errors[level] = `Cannot exceed baseline maximum of ${max} months.`;
      } else if (value < 1) {
        errors[level] = 'Must be at least 1 month.';
      } else {
        errors[level] = null;
      }
    }
    return errors;
  }, [months]);

  const hasErrors = useMemo(
    () => Object.values(validationErrors).some((e) => e !== null),
    [validationErrors]
  );

  function handleMonthsChange(level: string, value: string) {
    const num = parseInt(value, 10);
    if (!isNaN(num)) {
      setMonths((prev) => ({ ...prev, [level]: num }));
    }
  }

  function handleSave() {
    if (hasErrors) return;

    const thresholds: Record<string, ThresholdConfig> = {};
    for (const level of RISK_LEVELS) {
      thresholds[level] = {
        months: months[level],
        label: parsed[level].label,
      };
    }

    onSaveAndNext({ thresholds });
  }

  return (
    <div className={styles.stepCard}>
      <h2 className={styles.stepTitle}>Step 6: CDD Staleness Thresholds</h2>
      <p className={styles.stepDescription}>
        Set the maximum number of months before CDD information is considered stale
        for each risk level. Thresholds cannot exceed the regulatory baseline maximums.
      </p>

      {RISK_LEVELS.map((level) => {
        const max = BASELINE_MAXIMUMS[level];
        const error = validationErrors[level];

        return (
          <div key={level} className={styles.formGroup}>
            <label className={styles.formLabel}>
              {parsed[level].label} ({level})
            </label>
            <p className={styles.formHint}>
              Baseline maximum: {max} months. Set equal or lower for stricter review cycles.
            </p>
            <input
              type="number"
              className={styles.formInput}
              value={months[level]}
              min={1}
              max={max}
              onChange={(e) => handleMonthsChange(level, e.target.value)}
              style={{ maxWidth: '10rem' }}
            />
            {error && (
              <p style={{
                color: 'var(--status-high-text)',
                fontSize: '0.8125rem',
                marginTop: 'var(--space-1)',
              }}>
                {error}
              </p>
            )}
          </div>
        );
      })}

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
          disabled={saving || hasErrors}
        >
          {saving ? 'Saving...' : 'Save & Continue'}
        </button>
      </div>
    </div>
  );
}
