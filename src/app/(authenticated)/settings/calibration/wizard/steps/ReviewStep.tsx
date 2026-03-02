'use client';

import { useState, useEffect, useRef } from 'react';
import type { Json } from '@/lib/supabase/types';
import { validateConfigAgainstBaseline, activateConfig } from '@/app/actions/config';
import type { GapAcknowledgementInput } from '@/app/actions/config';
import styles from '../wizard.module.css';

interface ReviewStepProps {
  configVersionId: string | null;
  riskScoring: Json;
  cddRuleset: Json;
  sectorMapping: Json;
  cddStaleness: Json;
  onBack: () => void;
  onActivated: () => void;
}

interface ValidationGap {
  gapCode: string;
  severity: 'error' | 'warning';
  description: string;
  baselineRequirement: string;
  firmValue: string | null;
  authority: string;
}

export function ReviewStep({
  configVersionId,
  riskScoring: _riskScoring,
  cddRuleset: _cddRuleset,
  sectorMapping: _sectorMapping,
  cddStaleness: _cddStaleness,
  onBack,
  onActivated,
}: ReviewStepProps) {
  // Props kept for future summary display
  void _riskScoring;
  void _cddRuleset;
  void _sectorMapping;
  void _cddStaleness;

  const [validating, setValidating] = useState(true);
  const [validationError, setValidationError] = useState<string | null>(null);
  const [gaps, setGaps] = useState<ValidationGap[]>([]);
  const [isValid, setIsValid] = useState(false);
  const [rationales, setRationales] = useState<Record<string, string>>({});
  const [activating, setActivating] = useState(false);
  const [activationError, setActivationError] = useState<string | null>(null);
  const hasValidated = useRef(false);

  useEffect(() => {
    if (hasValidated.current) return;
    hasValidated.current = true;

    let cancelled = false;

    async function validate() {
      if (!configVersionId) {
        if (!cancelled) {
          setValidationError('No config version available. Please complete the previous steps first.');
          setValidating(false);
        }
        return;
      }

      const result = await validateConfigAgainstBaseline(configVersionId);

      if (cancelled) return;

      if (!result.success) {
        setValidationError(result.error);
        setValidating(false);
        return;
      }

      setIsValid(result.data.valid);
      setGaps(result.data.gaps);

      // Initialise rationale state for each gap
      const initialRationales: Record<string, string> = {};
      for (const gap of result.data.gaps) {
        initialRationales[gap.gapCode] = '';
      }
      setRationales(initialRationales);

      setValidating(false);
    }

    validate();

    return () => { cancelled = true; };
  }, [configVersionId]);

  function handleRationaleChange(gapCode: string, value: string) {
    setRationales((prev) => ({ ...prev, [gapCode]: value }));
  }

  const allGapsAcknowledged = gaps.length === 0 || gaps.every(
    (gap) => (rationales[gap.gapCode] ?? '').trim().length >= 20
  );

  async function handleActivate() {
    if (!configVersionId) return;

    setActivating(true);
    setActivationError(null);

    const acknowledgements: GapAcknowledgementInput[] = gaps.map((gap) => ({
      gapCode: gap.gapCode,
      gapDescription: gap.description,
      baselineRequirement: gap.baselineRequirement,
      firmValue: gap.firmValue,
      rationale: rationales[gap.gapCode] ?? '',
    }));

    const result = await activateConfig(configVersionId, acknowledgements);

    if (!result.success) {
      setActivationError(result.error);
      setActivating(false);
      return;
    }

    onActivated();
  }

  if (validating) {
    return (
      <div className={styles.stepCard}>
        <h2 className={styles.stepTitle}>Step 7: Review &amp; Activate</h2>
        <p className={styles.stepDescription}>
          Validating your configuration against the regulatory baseline...
        </p>
        <p className={styles.savingIndicator}>Running validation checks...</p>
      </div>
    );
  }

  if (validationError) {
    return (
      <div className={styles.stepCard}>
        <h2 className={styles.stepTitle}>Step 7: Review &amp; Activate</h2>
        <p className={styles.stepDescription}>
          Validation could not be completed.
        </p>
        <p style={{
          color: 'var(--status-high-text)',
          fontSize: '0.875rem',
          marginBottom: 'var(--space-4)',
        }}>
          {validationError}
        </p>
        <div className={styles.navigation}>
          <button
            type="button"
            className={styles.navButtonSecondary}
            onClick={onBack}
          >
            Back
          </button>
          <span />
        </div>
      </div>
    );
  }

  return (
    <div className={styles.stepCard}>
      <h2 className={styles.stepTitle}>Step 7: Review &amp; Activate</h2>
      <p className={styles.stepDescription}>
        Your configuration has been validated against the regulatory baseline.
        {gaps.length > 0
          ? ' The following gaps were identified. Provide MLRO rationale for each gap to proceed.'
          : ' Review the summary below and activate when ready.'}
      </p>

      {/* Validation result banner */}
      {isValid ? (
        <div style={{
          padding: 'var(--space-3) var(--space-4)',
          borderRadius: 'var(--radius-md)',
          backgroundColor: '#ecfdf5',
          border: '1px solid #10b981',
          color: '#065f46',
          fontWeight: 600,
          fontSize: '0.875rem',
          marginBottom: 'var(--space-4)',
        }}>
          All checks passed -- your configuration meets or exceeds the regulatory baseline.
        </div>
      ) : (
        <div style={{
          padding: 'var(--space-3) var(--space-4)',
          borderRadius: 'var(--radius-md)',
          backgroundColor: '#fffbeb',
          border: '1px solid #fbbf24',
          color: '#92400e',
          fontWeight: 600,
          fontSize: '0.875rem',
          marginBottom: 'var(--space-4)',
        }}>
          {gaps.length} gap{gaps.length !== 1 ? 's' : ''} identified.
          MLRO rationale required for each gap before activation.
        </div>
      )}

      {/* Gap cards */}
      {gaps.map((gap) => {
        const rationaleValue = rationales[gap.gapCode] ?? '';
        const isRationaleValid = rationaleValue.trim().length >= 20;

        return (
          <div key={gap.gapCode} className={styles.gapCard}>
            <div className={styles.gapHeader}>
              <h4 className={styles.gapTitle}>{gap.gapCode}</h4>
              <span
                className={`${styles.gapSeverity} ${
                  gap.severity === 'error' ? styles.error : styles.warning
                }`}
              >
                {gap.severity}
              </span>
            </div>

            <p className={styles.gapDescription}>
              {gap.description}
            </p>

            <p style={{ fontSize: '0.8125rem', margin: '0 0 var(--space-1) 0' }}>
              <strong>Baseline requirement:</strong> {gap.baselineRequirement}
            </p>

            {gap.authority && (
              <p style={{
                fontSize: '0.75rem',
                color: 'var(--text-secondary)',
                fontStyle: 'italic',
                margin: '0 0 var(--space-3) 0',
              }}>
                Authority: {gap.authority}
              </p>
            )}

            <label className={styles.formLabel}>
              MLRO Rationale
              <span style={{ fontWeight: 400, color: 'var(--text-secondary)' }}>
                {' '}(minimum 20 characters)
              </span>
            </label>
            <textarea
              className={styles.formTextarea}
              value={rationaleValue}
              onChange={(e) => handleRationaleChange(gap.gapCode, e.target.value)}
              placeholder="Explain why this gap is acceptable for your firm..."
            />
            {rationaleValue.length > 0 && !isRationaleValid && (
              <p style={{
                color: 'var(--status-high-text)',
                fontSize: '0.75rem',
                marginTop: 'var(--space-1)',
              }}>
                {20 - rationaleValue.trim().length} more character{20 - rationaleValue.trim().length !== 1 ? 's' : ''} required.
              </p>
            )}
          </div>
        );
      })}

      {activationError && (
        <p style={{
          color: 'var(--status-high-text)',
          fontSize: '0.875rem',
          marginTop: 'var(--space-3)',
        }}>
          Activation failed: {activationError}
        </p>
      )}

      <div className={styles.navigation}>
        <button
          type="button"
          className={styles.navButtonSecondary}
          onClick={onBack}
          disabled={activating}
        >
          Back
        </button>
        <button
          type="button"
          className={styles.navButtonDanger}
          onClick={handleActivate}
          disabled={activating || (!isValid && !allGapsAcknowledged)}
        >
          {activating ? 'Activating...' : 'Activate Configuration'}
        </button>
      </div>
    </div>
  );
}
