'use client';

import { useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { saveDraftConfig } from '@/app/actions/config';
import type { ConfigSection } from '@/app/actions/config';
import type { Json } from '@/lib/supabase/types';
import { RiskAppetiteStep } from './steps/RiskAppetiteStep';
import { ScoringWeightsStep } from './steps/ScoringWeightsStep';
import { AutomaticOutcomesStep } from './steps/AutomaticOutcomesStep';
import { CDDActionsStep } from './steps/CDDActionsStep';
import { SectorMappingStep } from './steps/SectorMappingStep';
import { CDDStalenessStep } from './steps/CDDStalenessStep';
import { ReviewStep } from './steps/ReviewStep';
import styles from './wizard.module.css';

interface WizardContainerProps {
  initialConfig: {
    id: string;
    riskScoring: Json;
    cddRuleset: Json;
    sectorMapping: Json;
    cddStaleness: Json;
    isDraft: boolean;
  } | null;
}

const STEPS = [
  { label: 'Risk Appetite', key: 'risk_appetite' },
  { label: 'Scoring Weights', key: 'scoring_weights' },
  { label: 'Outcomes', key: 'outcomes' },
  { label: 'CDD Actions', key: 'cdd_actions' },
  { label: 'Sectors', key: 'sectors' },
  { label: 'Staleness', key: 'staleness' },
  { label: 'Review', key: 'review' },
] as const;

export function WizardContainer({ initialConfig }: WizardContainerProps) {
  const router = useRouter();
  const [currentStep, setCurrentStep] = useState(0);
  const [saving, setSaving] = useState(false);
  const [configVersionId, setConfigVersionId] = useState<string | null>(
    initialConfig?.isDraft ? initialConfig.id : null
  );

  // Local state for each config section
  const [riskScoring, setRiskScoring] = useState<Json>(
    initialConfig?.riskScoring ?? null
  );
  const [cddRuleset, setCddRuleset] = useState<Json>(
    initialConfig?.cddRuleset ?? null
  );
  const [sectorMapping, setSectorMapping] = useState<Json>(
    initialConfig?.sectorMapping ?? null
  );
  const [cddStaleness, setCddStaleness] = useState<Json>(
    initialConfig?.cddStaleness ?? null
  );

  const saveSection = useCallback(async (section: ConfigSection, data: unknown) => {
    setSaving(true);
    try {
      const result = await saveDraftConfig(section, data);
      if (result.success) {
        setConfigVersionId(result.data.configVersionId);
      }
    } finally {
      setSaving(false);
    }
  }, []);

  const handleNext = useCallback(() => {
    setCurrentStep((prev) => Math.min(prev + 1, STEPS.length - 1));
  }, []);

  const handleBack = useCallback(() => {
    setCurrentStep((prev) => Math.max(prev - 1, 0));
  }, []);

  const handleSaveAndNext = useCallback(async (section: ConfigSection, data: unknown) => {
    // Update local state
    switch (section) {
      case 'risk_scoring':
        setRiskScoring(data as Json);
        break;
      case 'cdd_ruleset':
        setCddRuleset(data as Json);
        break;
      case 'sector_mapping':
        setSectorMapping(data as Json);
        break;
      case 'cdd_staleness':
        setCddStaleness(data as Json);
        break;
    }

    await saveSection(section, data);
    handleNext();
  }, [saveSection, handleNext]);

  const handleActivated = useCallback(() => {
    router.push('/settings/calibration');
    router.refresh();
  }, [router]);

  const renderStep = () => {
    switch (currentStep) {
      case 0:
        return (
          <RiskAppetiteStep
            initialData={riskScoring}
            onSaveAndNext={(data) => handleSaveAndNext('risk_scoring', data)}
            onBack={handleBack}
            saving={saving}
          />
        );
      case 1:
        return (
          <ScoringWeightsStep
            initialData={riskScoring}
            onSaveAndNext={(data) => handleSaveAndNext('risk_scoring', data)}
            onBack={handleBack}
            saving={saving}
          />
        );
      case 2:
        return (
          <AutomaticOutcomesStep
            initialData={riskScoring}
            onSaveAndNext={(data) => handleSaveAndNext('risk_scoring', data)}
            onBack={handleBack}
            saving={saving}
          />
        );
      case 3:
        return (
          <CDDActionsStep
            initialData={cddRuleset}
            onSaveAndNext={(data) => handleSaveAndNext('cdd_ruleset', data)}
            onBack={handleBack}
            saving={saving}
          />
        );
      case 4:
        return (
          <SectorMappingStep
            initialData={sectorMapping}
            onSaveAndNext={(data) => handleSaveAndNext('sector_mapping', data)}
            onBack={handleBack}
            saving={saving}
          />
        );
      case 5:
        return (
          <CDDStalenessStep
            initialData={cddStaleness}
            onSaveAndNext={(data) => handleSaveAndNext('cdd_staleness', data)}
            onBack={handleBack}
            saving={saving}
          />
        );
      case 6:
        return (
          <ReviewStep
            configVersionId={configVersionId}
            riskScoring={riskScoring}
            cddRuleset={cddRuleset}
            sectorMapping={sectorMapping}
            cddStaleness={cddStaleness}
            onBack={handleBack}
            onActivated={handleActivated}
          />
        );
      default:
        return null;
    }
  };

  return (
    <div className={styles.wizardContainer}>
      {/* Progress bar */}
      <div className={styles.progress}>
        {STEPS.map((step, index) => (
          <div key={step.key}>
            <div className={styles.progressStep + ' ' + (
              index === currentStep ? styles.active || 'active' :
              index < currentStep ? styles.completed || 'completed' : ''
            )}>
              <span
                className={`${styles.progressDot}`}
                style={
                  index === currentStep
                    ? { borderColor: 'var(--accent)', backgroundColor: 'var(--accent)', color: 'white' }
                    : index < currentStep
                    ? { borderColor: '#10b981', backgroundColor: '#10b981', color: 'white' }
                    : undefined
                }
              >
                {index < currentStep ? '\u2713' : index + 1}
              </span>
              <span>{step.label}</span>
            </div>
            {index < STEPS.length - 1 && (
              <div
                className={styles.progressLine}
                style={index < currentStep ? { backgroundColor: '#10b981' } : undefined}
              />
            )}
          </div>
        ))}
      </div>

      {/* Current step content */}
      {renderStep()}

      {/* Saving indicator */}
      {saving && (
        <div className={styles.savingIndicator}>Saving...</div>
      )}
    </div>
  );
}
