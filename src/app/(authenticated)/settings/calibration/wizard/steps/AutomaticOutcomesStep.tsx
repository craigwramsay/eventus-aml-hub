'use client';

import { useMemo } from 'react';
import type { Json } from '@/lib/supabase/types';
import styles from '../wizard.module.css';

interface StepProps {
  initialData: Json;
  onSaveAndNext: (data: unknown) => void;
  onBack: () => void;
  saving: boolean;
}

/** Outcome keys that are mandatory per regulatory baseline and cannot be removed. */
const MANDATORY_OUTCOME_IDS = new Set([
  'HIGH_RISK_EDD_REQUIRED',
  'OUT_OF_APPETITE',
]);

/** EDD trigger IDs that are mandatory per regulatory baseline and cannot be removed. */
const MANDATORY_TRIGGER_IDS = new Set([
  'client_account',
  'tcsp_activity',
]);

interface OutcomeTrigger {
  id: string;
  condition?: string;
  description?: string;
  authority?: string;
}

interface AutomaticOutcome {
  description: string;
  authority?: string;
  triggers: OutcomeTrigger[];
}

interface EDDTrigger {
  id: string;
  description: string;
  authority?: string;
}

function parseOutcomes(data: Json): Record<string, AutomaticOutcome> {
  if (data && typeof data === 'object' && !Array.isArray(data)) {
    const d = data as Record<string, Json>;
    if (d.automaticOutcomes && typeof d.automaticOutcomes === 'object' && !Array.isArray(d.automaticOutcomes)) {
      return d.automaticOutcomes as unknown as Record<string, AutomaticOutcome>;
    }
  }
  return {};
}

function parseEDDTriggers(data: Json): EDDTrigger[] {
  if (data && typeof data === 'object' && !Array.isArray(data)) {
    const d = data as Record<string, Json>;
    if (Array.isArray(d.eddTriggers)) {
      return d.eddTriggers as unknown as EDDTrigger[];
    }
  }
  return [];
}

export function AutomaticOutcomesStep({ initialData, onSaveAndNext, onBack, saving }: StepProps) {
  const outcomes = useMemo(() => parseOutcomes(initialData), [initialData]);
  const eddTriggers = useMemo(() => parseEDDTriggers(initialData), [initialData]);

  function handleSave() {
    // Pass through the riskScoring config unchanged — mandatory items cannot be edited
    const passThrough = JSON.parse(JSON.stringify(initialData ?? {}));
    onSaveAndNext(passThrough);
  }

  return (
    <div className={styles.stepCard}>
      <h2 className={styles.stepTitle}>Step 3: Automatic Outcomes &amp; EDD Triggers</h2>
      <p className={styles.stepDescription}>
        Review the automatic outcome rules and Enhanced Due Diligence triggers configured
        for your firm. Mandatory items are locked and cannot be removed.
      </p>

      {/* Automatic Outcomes */}
      <h3 style={{ fontSize: '1rem', fontWeight: 600, marginBottom: 'var(--space-3)' }}>
        Automatic Outcomes
      </h3>
      <table className={styles.configTable}>
        <thead>
          <tr>
            <th>Outcome</th>
            <th>Description</th>
            <th>Triggers</th>
            <th>Status</th>
          </tr>
        </thead>
        <tbody>
          {Object.entries(outcomes).map(([outcomeId, outcome]) => {
            const isMandatory = MANDATORY_OUTCOME_IDS.has(outcomeId);
            return (
              <tr key={outcomeId} className={isMandatory ? styles.lockedRow : undefined}>
                <td style={{ fontWeight: 600 }}>
                  {outcomeId.replace(/_/g, ' ')}
                </td>
                <td>
                  {outcome.description}
                  {outcome.authority && (
                    <div className={styles.authorityRef}>{outcome.authority}</div>
                  )}
                </td>
                <td>
                  <ul style={{ margin: 0, paddingLeft: '1rem', fontSize: '0.8125rem' }}>
                    {outcome.triggers.map((trigger) => (
                      <li key={trigger.id}>
                        {trigger.description ?? trigger.condition ?? trigger.id}
                        {trigger.authority && (
                          <span className={styles.authorityRef}> ({trigger.authority})</span>
                        )}
                      </li>
                    ))}
                  </ul>
                </td>
                <td>
                  {isMandatory ? (
                    <span className={styles.lockedBadge}>Locked</span>
                  ) : (
                    <span>Custom</span>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>

      {/* EDD Triggers */}
      <h3 style={{ fontSize: '1rem', fontWeight: 600, margin: 'var(--space-5) 0 var(--space-3) 0' }}>
        Enhanced Due Diligence (EDD) Triggers
      </h3>
      <table className={styles.configTable}>
        <thead>
          <tr>
            <th>Trigger</th>
            <th>Description</th>
            <th>Authority</th>
            <th>Status</th>
          </tr>
        </thead>
        <tbody>
          {eddTriggers.map((trigger) => {
            const isMandatory = MANDATORY_TRIGGER_IDS.has(trigger.id);
            return (
              <tr key={trigger.id} className={isMandatory ? styles.lockedRow : undefined}>
                <td style={{ fontWeight: 600 }}>
                  {trigger.id.replace(/_/g, ' ')}
                </td>
                <td>{trigger.description}</td>
                <td>
                  {trigger.authority && (
                    <span className={styles.authorityRef}>{trigger.authority}</span>
                  )}
                </td>
                <td>
                  {isMandatory ? (
                    <span className={styles.lockedBadge}>Locked</span>
                  ) : (
                    <span>Custom</span>
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
