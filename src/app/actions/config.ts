'use server';

/**
 * Server Actions for Firm Configuration Management
 *
 * Handles draft config creation, validation, activation, versioning,
 * document uploads, and baseline management.
 */

import { createClient } from '@/lib/supabase/server';
import { canConfigureFirm, isPlatformAdmin } from '@/lib/auth/roles';
import type { UserRole } from '@/lib/auth/roles';
import type {
  FirmConfigVersion,
  FirmConfigGapAcknowledgement,
  FirmDocument,
  RegulatoryBaselineRow,
} from '@/lib/supabase/types';
import type { RiskScoringConfig, CDDRulesetConfig } from '@/lib/rules-engine/types';
import type { SectorMappingConfig, CDDStalenessConfig } from '@/lib/rules-engine/config-loader';
import { validateConfig } from '@/lib/rules-engine/config-validator';
import type { ValidationResult } from '@/lib/rules-engine/config-validator';
import type { RegulatoryBaseline } from '@/lib/rules-engine/baseline-types';
import { runAssessmentWithConfig } from '@/lib/rules-engine';
import type { FormAnswers, ClientType, AssessmentOutput } from '@/lib/rules-engine/types';

// Default configs for initial draft creation
import defaultRiskScoring from '@/config/eventus/risk_scoring_v3_8.json';
import defaultCddRuleset from '@/config/eventus/cdd_ruleset.json';
import defaultSectorMapping from '@/config/eventus/rules/sector_mapping.json';
import defaultCddStaleness from '@/config/eventus/cdd_staleness.json';

type ActionResult<T = void> =
  | { success: true; data: T }
  | { success: false; error: string };

/**
 * Get authenticated user profile with role check
 */
async function getAuthenticatedProfile() {
  const supabase = await createClient();
  const {
    data: { user },
    error: userErr,
  } = await supabase.auth.getUser();

  if (userErr || !user) {
    return { supabase, user: null, profile: null, error: 'Not authenticated' as const };
  }

  const { data: profile, error: profileErr } = await supabase
    .from('user_profiles')
    .select('user_id, firm_id, role')
    .eq('user_id', user.id)
    .single();

  if (profileErr || !profile) {
    return { supabase, user, profile: null, error: 'User profile not found' as const };
  }

  return { supabase, user, profile, error: null };
}

// ============================================
// Draft Management
// ============================================

export type ConfigSection = 'risk_scoring' | 'cdd_ruleset' | 'sector_mapping' | 'cdd_staleness';

/**
 * Save one section of draft config. Creates draft if none exists.
 */
export async function saveDraftConfig(
  section: ConfigSection,
  data: unknown
): Promise<ActionResult<{ configVersionId: string }>> {
  const { supabase, user, profile, error } = await getAuthenticatedProfile();
  if (error || !profile || !user) {
    return { success: false, error: error || 'Not authenticated' };
  }

  if (!canConfigureFirm(profile.role as UserRole)) {
    return { success: false, error: 'Only MLROs can configure firm settings' };
  }

  // Look for existing draft
  const { data: existingDraft } = await supabase
    .from('firm_config_versions')
    .select('id, version_number')
    .eq('firm_id', profile.firm_id)
    .eq('status', 'draft')
    .single();

  if (existingDraft) {
    // Update existing draft
    const { error: updateErr } = await supabase
      .from('firm_config_versions')
      .update({ [section]: data })
      .eq('id', existingDraft.id);

    if (updateErr) {
      return { success: false, error: 'Failed to update draft config' };
    }

    return { success: true, data: { configVersionId: existingDraft.id } };
  }

  // Create new draft — determine next version number
  const { data: latestVersion } = await supabase
    .from('firm_config_versions')
    .select('version_number')
    .eq('firm_id', profile.firm_id)
    .order('version_number', { ascending: false })
    .limit(1)
    .single();

  const nextVersion = (latestVersion?.version_number ?? 0) + 1;

  // Start from defaults for non-specified sections
  const defaults = {
    risk_scoring: defaultRiskScoring,
    cdd_ruleset: defaultCddRuleset,
    sector_mapping: defaultSectorMapping,
    cdd_staleness: defaultCddStaleness,
  };

  const { data: newDraft, error: insertErr } = await supabase
    .from('firm_config_versions')
    .insert({
      firm_id: profile.firm_id,
      version_number: nextVersion,
      risk_scoring: section === 'risk_scoring' ? data : defaults.risk_scoring,
      cdd_ruleset: section === 'cdd_ruleset' ? data : defaults.cdd_ruleset,
      sector_mapping: section === 'sector_mapping' ? data : defaults.sector_mapping,
      cdd_staleness: section === 'cdd_staleness' ? data : defaults.cdd_staleness,
      status: 'draft',
      created_by: user.id,
    })
    .select('id')
    .single();

  if (insertErr || !newDraft) {
    return { success: false, error: 'Failed to create draft config' };
  }

  // Update firm config status
  await supabase
    .from('firms')
    .update({ config_status: 'draft' })
    .eq('id', profile.firm_id);

  return { success: true, data: { configVersionId: newDraft.id } };
}

/**
 * Get the current draft config (or null if none exists)
 */
export async function getDraftConfig(): Promise<ActionResult<FirmConfigVersion | null>> {
  const { supabase, profile, error } = await getAuthenticatedProfile();
  if (error || !profile) {
    return { success: false, error: error || 'Not authenticated' };
  }

  const { data: draft } = await supabase
    .from('firm_config_versions')
    .select('*')
    .eq('firm_id', profile.firm_id)
    .eq('status', 'draft')
    .single();

  return { success: true, data: (draft as FirmConfigVersion) ?? null };
}

/**
 * Delete an unused draft
 */
export async function deleteDraft(configVersionId: string): Promise<ActionResult> {
  const { supabase, profile, error } = await getAuthenticatedProfile();
  if (error || !profile) {
    return { success: false, error: error || 'Not authenticated' };
  }

  if (!canConfigureFirm(profile.role as UserRole)) {
    return { success: false, error: 'Only MLROs can manage config drafts' };
  }

  const { error: deleteErr } = await supabase
    .from('firm_config_versions')
    .delete()
    .eq('id', configVersionId)
    .eq('firm_id', profile.firm_id)
    .eq('status', 'draft');

  if (deleteErr) {
    return { success: false, error: 'Failed to delete draft' };
  }

  // Check if there's still an active config
  const { data: activeConfig } = await supabase
    .from('firm_config_versions')
    .select('id')
    .eq('firm_id', profile.firm_id)
    .eq('status', 'active')
    .single();

  await supabase
    .from('firms')
    .update({ config_status: activeConfig ? 'active' : 'unconfigured' })
    .eq('id', profile.firm_id);

  return { success: true, data: undefined };
}

// ============================================
// Validation
// ============================================

/**
 * Validate a config version against the regulatory baseline
 */
export async function validateConfigAgainstBaseline(
  configVersionId: string
): Promise<ActionResult<ValidationResult>> {
  const { supabase, profile, error } = await getAuthenticatedProfile();
  if (error || !profile) {
    return { success: false, error: error || 'Not authenticated' };
  }

  // Load config version
  const { data: configVersion, error: fetchErr } = await supabase
    .from('firm_config_versions')
    .select('*')
    .eq('id', configVersionId)
    .eq('firm_id', profile.firm_id)
    .single();

  if (fetchErr || !configVersion) {
    return { success: false, error: 'Config version not found' };
  }

  // Load baseline
  const baseline = await loadActiveBaseline(supabase);
  if (!baseline) {
    return { success: false, error: 'No active regulatory baseline found' };
  }

  const result = validateConfig(
    {
      riskScoring: configVersion.risk_scoring as unknown as RiskScoringConfig,
      cddRuleset: configVersion.cdd_ruleset as unknown as CDDRulesetConfig,
      sectorMapping: configVersion.sector_mapping as unknown as SectorMappingConfig,
      cddStaleness: configVersion.cdd_staleness as unknown as CDDStalenessConfig,
    },
    baseline
  );

  return { success: true, data: result };
}

// ============================================
// Activation
// ============================================

export interface GapAcknowledgementInput {
  gapCode: string;
  gapDescription: string;
  baselineRequirement: string;
  firmValue: string | null;
  rationale: string;
}

/**
 * Activate a config version — validate, store gap acknowledgements, set active
 */
export async function activateConfig(
  configVersionId: string,
  gapAcknowledgements: GapAcknowledgementInput[]
): Promise<ActionResult> {
  const { supabase, user, profile, error } = await getAuthenticatedProfile();
  if (error || !profile || !user) {
    return { success: false, error: error || 'Not authenticated' };
  }

  if (!canConfigureFirm(profile.role as UserRole)) {
    return { success: false, error: 'Only MLROs can activate firm config' };
  }

  // Verify config exists and is a draft for this firm
  const { data: configVersion, error: fetchErr } = await supabase
    .from('firm_config_versions')
    .select('*')
    .eq('id', configVersionId)
    .eq('firm_id', profile.firm_id)
    .eq('status', 'draft')
    .single();

  if (fetchErr || !configVersion) {
    return { success: false, error: 'Draft config not found' };
  }

  // Run validation
  const baseline = await loadActiveBaseline(supabase);
  if (!baseline) {
    return { success: false, error: 'No active regulatory baseline found' };
  }

  const validationResult = validateConfig(
    {
      riskScoring: configVersion.risk_scoring as unknown as RiskScoringConfig,
      cddRuleset: configVersion.cdd_ruleset as unknown as CDDRulesetConfig,
      sectorMapping: configVersion.sector_mapping as unknown as SectorMappingConfig,
      cddStaleness: configVersion.cdd_staleness as unknown as CDDStalenessConfig,
    },
    baseline
  );

  // Verify all gaps are acknowledged
  if (!validationResult.valid) {
    const ackCodes = new Set(gapAcknowledgements.map((a) => a.gapCode));
    const unacknowledgedGaps = validationResult.gaps.filter(
      (g) => !ackCodes.has(g.gapCode)
    );

    if (unacknowledgedGaps.length > 0) {
      return {
        success: false,
        error: `${unacknowledgedGaps.length} gap(s) not acknowledged: ${unacknowledgedGaps.map((g) => g.gapCode).join(', ')}`,
      };
    }

    // Validate rationale length
    for (const ack of gapAcknowledgements) {
      if (!ack.rationale || ack.rationale.trim().length < 20) {
        return {
          success: false,
          error: `Gap acknowledgement rationale must be at least 20 characters (gap: ${ack.gapCode})`,
        };
      }
    }
  }

  const now = new Date().toISOString();

  // Supersede current active config (if any)
  await supabase
    .from('firm_config_versions')
    .update({ status: 'superseded', superseded_at: now })
    .eq('firm_id', profile.firm_id)
    .eq('status', 'active');

  // Activate the new config
  const { error: activateErr } = await supabase
    .from('firm_config_versions')
    .update({
      status: 'active',
      activated_at: now,
      activated_by: user.id,
    })
    .eq('id', configVersionId);

  if (activateErr) {
    return { success: false, error: 'Failed to activate config' };
  }

  // Store gap acknowledgements
  if (gapAcknowledgements.length > 0) {
    const ackRows = gapAcknowledgements.map((ack) => ({
      firm_id: profile.firm_id,
      config_version_id: configVersionId,
      gap_code: ack.gapCode,
      gap_description: ack.gapDescription,
      baseline_requirement: ack.baselineRequirement,
      firm_value: ack.firmValue,
      acknowledged_by: user.id,
      rationale: ack.rationale.trim(),
    }));

    await supabase
      .from('firm_config_gap_acknowledgements')
      .insert(ackRows);
  }

  // Update firm status + pointer
  await supabase
    .from('firms')
    .update({
      config_status: 'active',
      active_config_version_id: configVersionId,
    })
    .eq('id', profile.firm_id);

  // Audit log
  await supabase.from('audit_events').insert({
    firm_id: profile.firm_id,
    entity_type: 'firm_config',
    entity_id: configVersionId,
    action: 'config_activated',
    metadata: {
      version_number: configVersion.version_number,
      gaps_acknowledged: gapAcknowledgements.length,
      gap_codes: gapAcknowledgements.map((a) => a.gapCode),
    },
    created_by: user.id,
  });

  return { success: true, data: undefined };
}

// ============================================
// Read Operations
// ============================================

/**
 * Get the firm's active config version
 */
export async function getActiveConfig(): Promise<ActionResult<FirmConfigVersion | null>> {
  const { supabase, profile, error } = await getAuthenticatedProfile();
  if (error || !profile) {
    return { success: false, error: error || 'Not authenticated' };
  }

  const { data: config } = await supabase
    .from('firm_config_versions')
    .select('*')
    .eq('firm_id', profile.firm_id)
    .eq('status', 'active')
    .single();

  return { success: true, data: (config as FirmConfigVersion) ?? null };
}

/**
 * List all config versions for the firm
 */
export async function getConfigVersionHistory(): Promise<ActionResult<FirmConfigVersion[]>> {
  const { supabase, profile, error } = await getAuthenticatedProfile();
  if (error || !profile) {
    return { success: false, error: error || 'Not authenticated' };
  }

  const { data: versions, error: fetchErr } = await supabase
    .from('firm_config_versions')
    .select('*')
    .eq('firm_id', profile.firm_id)
    .order('version_number', { ascending: false });

  if (fetchErr) {
    return { success: false, error: 'Failed to load config history' };
  }

  return { success: true, data: (versions as FirmConfigVersion[]) ?? [] };
}

// ============================================
// Preview
// ============================================

/**
 * Run a preview assessment with draft config (result is not stored)
 */
export async function runPreviewAssessment(
  configVersionId: string,
  clientType: ClientType,
  formAnswers: FormAnswers
): Promise<ActionResult<AssessmentOutput>> {
  const { supabase, profile, error } = await getAuthenticatedProfile();
  if (error || !profile) {
    return { success: false, error: error || 'Not authenticated' };
  }

  const { data: configVersion, error: fetchErr } = await supabase
    .from('firm_config_versions')
    .select('risk_scoring, cdd_ruleset')
    .eq('id', configVersionId)
    .eq('firm_id', profile.firm_id)
    .single();

  if (fetchErr || !configVersion) {
    return { success: false, error: 'Config version not found' };
  }

  const output = runAssessmentWithConfig(
    { clientType, formAnswers },
    configVersion.risk_scoring as unknown as RiskScoringConfig,
    configVersion.cdd_ruleset as unknown as CDDRulesetConfig
  );

  return { success: true, data: output };
}

// ============================================
// Documents
// ============================================

/**
 * Upload a firm document (PWRA/PCP/AML policy)
 */
export async function uploadFirmDocument(
  formData: FormData
): Promise<ActionResult<FirmDocument>> {
  const { supabase, user, profile, error } = await getAuthenticatedProfile();
  if (error || !profile || !user) {
    return { success: false, error: error || 'Not authenticated' };
  }

  if (!canConfigureFirm(profile.role as UserRole)) {
    return { success: false, error: 'Only MLROs can upload firm documents' };
  }

  const file = formData.get('file') as File | null;
  const documentType = formData.get('document_type') as string;
  const description = formData.get('description') as string | null;

  if (!file) {
    return { success: false, error: 'No file provided' };
  }

  if (!['pwra', 'pcp', 'aml_policy', 'other'].includes(documentType)) {
    return { success: false, error: 'Invalid document type' };
  }

  // Upload to storage
  const timestamp = Date.now();
  const filePath = `${profile.firm_id}/${documentType}/${timestamp}_${file.name}`;

  const { error: uploadErr } = await supabase.storage
    .from('firm-documents')
    .upload(filePath, file);

  if (uploadErr) {
    return { success: false, error: 'Failed to upload file' };
  }

  // Create database record
  const { data: doc, error: insertErr } = await supabase
    .from('firm_documents')
    .insert({
      firm_id: profile.firm_id,
      document_type: documentType,
      file_name: file.name,
      file_path: filePath,
      file_size: file.size,
      description: description || null,
      uploaded_by: user.id,
    })
    .select()
    .single();

  if (insertErr || !doc) {
    return { success: false, error: 'Failed to create document record' };
  }

  return { success: true, data: doc as FirmDocument };
}

/**
 * List firm documents
 */
export async function getFirmDocuments(): Promise<ActionResult<FirmDocument[]>> {
  const { supabase, profile, error } = await getAuthenticatedProfile();
  if (error || !profile) {
    return { success: false, error: error || 'Not authenticated' };
  }

  const { data: docs, error: fetchErr } = await supabase
    .from('firm_documents')
    .select('*')
    .eq('firm_id', profile.firm_id)
    .order('uploaded_at', { ascending: false });

  if (fetchErr) {
    return { success: false, error: 'Failed to load documents' };
  }

  return { success: true, data: (docs as FirmDocument[]) ?? [] };
}

/**
 * Delete a firm document
 */
export async function deleteFirmDocument(documentId: string): Promise<ActionResult> {
  const { supabase, user, profile, error } = await getAuthenticatedProfile();
  if (error || !profile || !user) {
    return { success: false, error: error || 'Not authenticated' };
  }

  if (!canConfigureFirm(profile.role as UserRole)) {
    return { success: false, error: 'Only MLROs can delete firm documents' };
  }

  // Get document to find file path
  const { data: doc } = await supabase
    .from('firm_documents')
    .select('file_path')
    .eq('id', documentId)
    .eq('firm_id', profile.firm_id)
    .single();

  if (!doc) {
    return { success: false, error: 'Document not found' };
  }

  // Delete from storage
  await supabase.storage.from('firm-documents').remove([doc.file_path]);

  // Delete record
  const { error: deleteErr } = await supabase
    .from('firm_documents')
    .delete()
    .eq('id', documentId);

  if (deleteErr) {
    return { success: false, error: 'Failed to delete document' };
  }

  return { success: true, data: undefined };
}

// ============================================
// Baseline (Platform Admin)
// ============================================

/**
 * Get the active regulatory baseline
 */
export async function getActiveBaseline(): Promise<ActionResult<RegulatoryBaselineRow | null>> {
  const { supabase, error } = await getAuthenticatedProfile();
  if (error) {
    return { success: false, error: error || 'Not authenticated' };
  }

  const { data: baseline } = await supabase
    .from('regulatory_baseline')
    .select('*')
    .eq('status', 'active')
    .single();

  return { success: true, data: (baseline as RegulatoryBaselineRow) ?? null };
}

// ============================================
// Admin Operations
// ============================================

/**
 * Get all firms with their config status (platform admin only)
 */
export async function getAllFirmsConfigStatus(): Promise<ActionResult<Array<{
  id: string;
  name: string;
  config_status: string;
  active_config_version_id: string | null;
}>>> {
  const { supabase, profile, error } = await getAuthenticatedProfile();
  if (error || !profile) {
    return { success: false, error: error || 'Not authenticated' };
  }

  if (!isPlatformAdmin(profile.role as UserRole)) {
    return { success: false, error: 'Platform admin access required' };
  }

  const { data: firms, error: fetchErr } = await supabase
    .from('firms')
    .select('id, name, config_status, active_config_version_id')
    .order('name');

  if (fetchErr) {
    return { success: false, error: 'Failed to load firms' };
  }

  return { success: true, data: firms ?? [] };
}

/**
 * Get a firm's config history and gap acknowledgements (platform admin only)
 */
export async function getFirmConfigDetail(firmId: string): Promise<ActionResult<{
  versions: FirmConfigVersion[];
  acknowledgements: FirmConfigGapAcknowledgement[];
}>> {
  const { supabase, profile, error } = await getAuthenticatedProfile();
  if (error || !profile) {
    return { success: false, error: error || 'Not authenticated' };
  }

  if (!isPlatformAdmin(profile.role as UserRole)) {
    return { success: false, error: 'Platform admin access required' };
  }

  const { data: versions } = await supabase
    .from('firm_config_versions')
    .select('*')
    .eq('firm_id', firmId)
    .order('version_number', { ascending: false });

  const { data: acks } = await supabase
    .from('firm_config_gap_acknowledgements')
    .select('*')
    .eq('firm_id', firmId)
    .order('acknowledged_at', { ascending: false });

  return {
    success: true,
    data: {
      versions: (versions as FirmConfigVersion[]) ?? [],
      acknowledgements: (acks as FirmConfigGapAcknowledgement[]) ?? [],
    },
  };
}

// ============================================
// Helpers
// ============================================

async function loadActiveBaseline(
  supabase: Awaited<ReturnType<typeof createClient>>
): Promise<RegulatoryBaseline | null> {
  const { data: baseline } = await supabase
    .from('regulatory_baseline')
    .select('baseline_rules')
    .eq('status', 'active')
    .single();

  if (!baseline) {
    // Fall back to static file
    try {
      const staticBaseline = await import('@/config/platform/regulatory_baseline_v1.json');
      return staticBaseline.default as unknown as RegulatoryBaseline;
    } catch {
      return null;
    }
  }

  return baseline.baseline_rules as unknown as RegulatoryBaseline;
}
