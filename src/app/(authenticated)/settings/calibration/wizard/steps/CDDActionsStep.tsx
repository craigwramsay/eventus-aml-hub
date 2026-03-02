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

/** CDD action IDs that are mandatory per regulatory baseline and cannot be removed. */
const MANDATORY_ACTION_IDS = new Set([
  'verify_identity',
  'assess_purpose_nature',
  'beneficial_ownership',
  'ongoing_monitoring',
  'pep_screening',
  'sanctions_check',
]);

const RISK_LEVELS = ['LOW', 'MEDIUM', 'HIGH'] as const;

interface CDDAction {
  id: string;
  label: string;
  authority?: string;
}

interface RiskLevelConfig {
  cdd_actions?: CDDAction[];
  edd?: CDDAction[];
  sow?: { form?: string; evidence?: string; label?: string };
  sof?: { form?: string; evidence?: string; label?: string };
}

function parseRiskLevelActions(data: Json): Record<string, RiskLevelConfig> {
  if (data && typeof data === 'object' && !Array.isArray(data)) {
    const d = data as Record<string, Json>;
    // Look in the individual client type config which contains per-risk-level CDD actions
    const individual = d.individual;
    if (individual && typeof individual === 'object' && !Array.isArray(individual)) {
      const result: Record<string, RiskLevelConfig> = {};
      const ind = individual as Record<string, Json>;
      for (const level of RISK_LEVELS) {
        const levelConfig = ind[level];
        if (levelConfig && typeof levelConfig === 'object' && !Array.isArray(levelConfig)) {
          result[level] = levelConfig as unknown as RiskLevelConfig;
        }
      }
      return result;
    }
  }
  return {};
}

function collectActions(config: RiskLevelConfig | undefined): CDDAction[] {
  if (!config) return [];
  const actions: CDDAction[] = [];

  if (config.cdd_actions) {
    actions.push(...config.cdd_actions);
  }
  if (config.edd) {
    actions.push(...config.edd);
  }
  if (config.sow && (config.sow.form || config.sow.evidence)) {
    actions.push({
      id: 'source_of_wealth',
      label: config.sow.label ?? 'Source of Wealth',
    });
  }
  if (config.sof && (config.sof.form || config.sof.evidence)) {
    actions.push({
      id: 'source_of_funds',
      label: config.sof.label ?? 'Source of Funds',
    });
  }

  return actions;
}

export function CDDActionsStep({ initialData, onSaveAndNext, onBack, saving }: StepProps) {
  const riskLevelConfigs = useMemo(() => parseRiskLevelActions(initialData), [initialData]);

  const actionsByLevel = useMemo(() => {
    const result: Record<string, CDDAction[]> = {};
    for (const level of RISK_LEVELS) {
      result[level] = collectActions(riskLevelConfigs[level]);
    }
    return result;
  }, [riskLevelConfigs]);

  function handleSave() {
    // Pass through the CDD ruleset config unchanged — this step is read-only review
    const passThrough = JSON.parse(JSON.stringify(initialData ?? {}));
    onSaveAndNext(passThrough);
  }

  return (
    <div className={styles.stepCard}>
      <h2 className={styles.stepTitle}>Step 4: CDD Actions per Risk Level</h2>
      <p className={styles.stepDescription}>
        Review the Customer Due Diligence actions required at each risk level.
        Baseline-mandated actions are locked and cannot be removed.
      </p>

      <div className={styles.threeColumnGrid}>
        {RISK_LEVELS.map((level) => {
          const levelClass = level.toLowerCase() as 'low' | 'medium' | 'high';
          const actions = actionsByLevel[level] ?? [];

          return (
            <div key={level}>
              <div className={`${styles.columnHeader} ${styles[levelClass]}`}>
                {level}
              </div>
              {actions.length === 0 ? (
                <p style={{ fontSize: '0.8125rem', color: 'var(--text-secondary)', textAlign: 'center' }}>
                  No actions configured
                </p>
              ) : (
                actions.map((action) => {
                  const isLocked = MANDATORY_ACTION_IDS.has(action.id);
                  return (
                    <div
                      key={action.id}
                      className={`${styles.actionItem}${isLocked ? ` ${styles.locked}` : ''}`}
                    >
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <span>{action.label}</span>
                        {isLocked && (
                          <span className={styles.lockedBadge}>Locked</span>
                        )}
                      </div>
                      {action.authority && (
                        <div className={styles.authorityRef}>{action.authority}</div>
                      )}
                    </div>
                  );
                })
              )}
            </div>
          );
        })}
      </div>

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
