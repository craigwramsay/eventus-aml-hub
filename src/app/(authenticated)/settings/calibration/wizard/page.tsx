import { redirect } from 'next/navigation';
import { getUserProfile } from '@/lib/supabase/server';
import { canConfigureFirm } from '@/lib/auth/roles';
import { getDraftConfig, getActiveConfig } from '@/app/actions/config';
import { WizardContainer } from './WizardContainer';

export default async function CalibrationWizardPage() {
  const profile = await getUserProfile();
  if (!profile || !canConfigureFirm(profile.role)) {
    redirect('/dashboard');
  }

  const [draftResult, activeResult] = await Promise.all([
    getDraftConfig(),
    getActiveConfig(),
  ]);

  const draftConfig = draftResult.success ? draftResult.data : null;
  const activeConfig = activeResult.success ? activeResult.data : null;

  // Determine initial config to populate wizard
  const initialConfig = draftConfig || activeConfig || null;

  return (
    <WizardContainer
      initialConfig={initialConfig ? {
        id: initialConfig.id,
        riskScoring: initialConfig.risk_scoring,
        cddRuleset: initialConfig.cdd_ruleset,
        sectorMapping: initialConfig.sector_mapping,
        cddStaleness: initialConfig.cdd_staleness,
        isDraft: initialConfig.status === 'draft',
      } : null}
    />
  );
}
