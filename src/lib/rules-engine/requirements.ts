/**
 * Requirements module for the Eventus AML Rules Engine
 * Maps risk levels to mandatory CDD/EDD actions from config
 * No hardcoded rules - all logic driven by config
 */

import type {
  ClientType,
  RiskLevel,
  MandatoryAction,
  CDDRulesetConfig,
  CDDRiskLevelConfig,
  CDDAction,
  EDDTriggerResult,
  AssessmentWarning,
  FormAnswers,
} from './types';

/**
 * Map CDD action to MandatoryAction
 */
function mapCDDAction(
  action: CDDAction,
  category: MandatoryAction['category'],
  priority: MandatoryAction['priority']
): MandatoryAction {
  const mapped: MandatoryAction = {
    actionId: action.action,
    actionName: action.action.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase()),
    description: action.description,
    category,
    priority,
  };

  if (action.display_text) {
    mapped.displayText = action.display_text;
  }

  if (action.evidence_types && action.evidence_types.length > 0) {
    mapped.evidenceTypes = action.evidence_types;
  }

  return mapped;
}

/**
 * Extract actions from a risk level config
 */
function extractActionsFromConfig(
  config: CDDRiskLevelConfig,
  isHighRisk: boolean
): MandatoryAction[] {
  const actions: MandatoryAction[] = [];

  // CDD actions
  if (config.cdd_actions) {
    for (const action of config.cdd_actions) {
      // Skip "all_*_actions" references
      if (action.action.startsWith('all_')) continue;
      actions.push(mapCDDAction(action, 'cdd', 'required'));
    }
  }

  // Entity identification
  if (config.entity_identification) {
    for (const action of config.entity_identification) {
      actions.push(mapCDDAction(action, 'cdd', 'required'));
    }
  }

  // Directors verification
  if (config.directors) {
    for (const action of config.directors) {
      actions.push(mapCDDAction(action, 'cdd', 'required'));
    }
  }

  // Members/Partners verification
  if (config.members_partners) {
    for (const action of config.members_partners) {
      actions.push(mapCDDAction(action, 'cdd', 'required'));
    }
  }

  // Beneficial ownership
  if (config.beneficial_ownership) {
    for (const action of config.beneficial_ownership) {
      actions.push(mapCDDAction(action, 'cdd', 'required'));
    }
  }

  // Ownership & control
  if (config.ownership_control) {
    for (const action of config.ownership_control) {
      actions.push(mapCDDAction(action, 'cdd', 'required'));
    }
  }

  // Ongoing monitoring
  if (config.ongoing_monitoring?.required) {
    actions.push({
      actionId: 'ongoing_monitoring',
      actionName: 'Ongoing Monitoring',
      description: config.ongoing_monitoring.description,
      category: 'monitoring',
      priority: 'required',
    });
  }

  // Enhanced monitoring
  if (config.enhanced_monitoring?.required) {
    actions.push({
      actionId: 'enhanced_monitoring',
      actionName: 'Enhanced Ongoing Monitoring',
      description: config.enhanced_monitoring.description,
      category: 'monitoring',
      priority: 'required',
    });
  }

  // Source of Wealth
  if (config.sow?.required) {
    actions.push({
      actionId: 'sow_form',
      actionName: 'Source of Wealth',
      description: 'Complete and retain Source of Wealth Form',
      category: 'sow',
      priority: 'required',
    });
    if (config.sow.actions) {
      for (const action of config.sow.actions) {
        if (action.action !== 'complete_form') {
          actions.push(mapCDDAction(action, 'sow', 'required'));
        }
      }
    }
  }

  // Source of Funds
  if (config.sof?.required) {
    actions.push({
      actionId: 'sof_form',
      actionName: 'Source of Funds',
      description: 'Complete and retain Source of Funds Form',
      category: 'sof',
      priority: 'required',
    });
    if (config.sof.actions) {
      for (const action of config.sof.actions) {
        if (action.action !== 'complete_form') {
          actions.push(mapCDDAction(action, 'sof', 'required'));
        }
      }
    }
  }

  // Enhanced Due Diligence
  if (config.edd?.required) {
    actions.push({
      actionId: 'edd_required',
      actionName: 'Enhanced Due Diligence',
      description: 'Enhanced Due Diligence is required for this risk level',
      category: 'edd',
      priority: 'required',
    });
    if (config.edd.actions) {
      for (const action of config.edd.actions) {
        actions.push(mapCDDAction(action, 'edd', 'required'));
      }
    }
  }

  return actions;
}

/** Entity type values from the corporate CMLRA form that map to excluded types */
const EXCLUDED_ENTITY_PATTERNS: Array<{ pattern: string; label: string }> = [
  { pattern: 'Trustee(s) of a trust', label: 'Trust' },
  { pattern: 'Unincorporated association', label: 'Unincorporated association' },
];

/**
 * Get the appropriate CDD client type key from our client type.
 * Also checks for entity exclusions and returns warnings.
 */
function getCDDClientTypeKey(
  clientType: ClientType,
  formAnswers?: FormAnswers
): { key: keyof CDDRulesetConfig['clientTypes']; warnings: AssessmentWarning[] } {
  const warnings: AssessmentWarning[] = [];

  if (clientType === 'individual') {
    return { key: 'individual', warnings };
  }

  let key: keyof CDDRulesetConfig['clientTypes'] = 'uk_private_limited_company';

  if (formAnswers) {
    const entityType = formAnswers['10']; // Entity type field
    if (typeof entityType === 'string') {
      if (entityType.includes('LLP') || entityType.includes('Partnership')) {
        key = 'uk_llp';
      }

      // Check for excluded entity types
      for (const excluded of EXCLUDED_ENTITY_PATTERNS) {
        if (entityType === excluded.pattern) {
          warnings.push({
            warningId: `excluded_entity_${excluded.label.toLowerCase().replace(/\s+/g, '_')}`,
            message: `Entity type "${excluded.label}" falls outside the standard CDD ruleset. This matter must be assessed by reference to the Eventus AML PCPs and escalated to the MLRO for bespoke assessment.`,
            authority: 'CDD Ruleset - Exclusions; Eventus AML PCPs',
          });
        }
      }
    }
  }

  return { key, warnings };
}

/** Return type for getMandatoryActions including warnings */
export interface MandatoryActionsResult {
  actions: MandatoryAction[];
  warnings: AssessmentWarning[];
}

/**
 * Check if the client is new based on form answers
 */
function isNewClient(clientType: ClientType, formAnswers?: FormAnswers): boolean {
  if (!formAnswers) return false;
  // Individual: field 3, Corporate: field 16
  const fieldId = clientType === 'individual' ? '3' : '16';
  const answer = formAnswers[fieldId];
  return answer === 'New client';
}

/**
 * Get mandatory actions for a given risk level and client type
 */
export function getMandatoryActions(
  clientType: ClientType,
  riskLevel: RiskLevel,
  config: CDDRulesetConfig,
  formAnswers?: FormAnswers,
  eddTriggers?: EDDTriggerResult[]
): MandatoryActionsResult {
  const { key: clientTypeKey, warnings } = getCDDClientTypeKey(clientType, formAnswers);
  const clientConfig = config.clientTypes[clientTypeKey];

  if (!clientConfig) {
    return { actions: [], warnings };
  }

  const riskConfig = clientConfig.riskLevels[riskLevel];
  if (!riskConfig) {
    return { actions: [], warnings };
  }

  const actions = extractActionsFromConfig(riskConfig, riskLevel === 'HIGH');

  // For MEDIUM and HIGH, we need to include lower-level actions too
  // The config uses "all_low_risk_actions" and "all_medium_risk_actions" references
  if (riskLevel === 'MEDIUM' || riskLevel === 'HIGH') {
    const lowConfig = clientConfig.riskLevels['LOW'];
    if (lowConfig) {
      const lowActions = extractActionsFromConfig(lowConfig, false);
      // Add any low-risk actions not already included
      for (const action of lowActions) {
        if (!actions.find((a) => a.actionId === action.actionId)) {
          actions.push(action);
        }
      }
    }
  }

  if (riskLevel === 'HIGH') {
    const mediumConfig = clientConfig.riskLevels['MEDIUM'];
    if (mediumConfig) {
      const mediumActions = extractActionsFromConfig(mediumConfig, false);
      // Add any medium-risk actions not already included
      for (const action of mediumActions) {
        if (!actions.find((a) => a.actionId === action.actionId)) {
          actions.push(action);
        }
      }
    }
  }

  // Gap 3: New client SoW at LOW risk
  if (riskLevel === 'LOW' && isNewClient(clientType, formAnswers)) {
    const sowConfig = riskConfig.new_client_sow;
    if (sowConfig) {
      // Add SoW form (required)
      if (!actions.find((a) => a.actionId === 'sow_form')) {
        actions.push({
          actionId: 'sow_form',
          actionName: 'Source of Wealth',
          description: 'Complete and retain Source of Wealth Form (new client requirement)',
          category: 'sow',
          priority: sowConfig.form,
        });
      }
      // Add SoW evidence (recommended at LOW)
      if (!actions.find((a) => a.actionId === 'sow_evidence_new_client')) {
        actions.push({
          actionId: 'sow_evidence_new_client',
          actionName: 'Source of Wealth Evidence',
          description: 'Obtain supporting evidence aligned to the declared source of wealth',
          category: 'sow',
          priority: sowConfig.evidence,
        });
      }
    }
  }

  // Gap 1: EDD trigger injection - add EDD actions from HIGH config when triggers are present
  if (eddTriggers && eddTriggers.length > 0 && riskLevel !== 'HIGH') {
    const highConfig = clientConfig.riskLevels['HIGH'];
    if (highConfig?.edd?.actions) {
      // Add the EDD required marker
      if (!actions.find((a) => a.actionId === 'edd_required')) {
        actions.push({
          actionId: 'edd_required',
          actionName: 'Enhanced Due Diligence',
          description: 'Enhanced Due Diligence is required due to EDD triggers detected',
          category: 'edd',
          priority: 'required',
        });
      }
      // Add individual EDD actions from HIGH config
      for (const eddAction of highConfig.edd.actions) {
        if (!actions.find((a) => a.actionId === eddAction.action)) {
          actions.push(mapCDDAction(eddAction, 'edd', 'required'));
        }
      }
    }
    // Also add enhanced monitoring if not already present
    if (highConfig?.enhanced_monitoring?.required) {
      if (!actions.find((a) => a.actionId === 'enhanced_monitoring')) {
        actions.push({
          actionId: 'enhanced_monitoring',
          actionName: 'Enhanced Ongoing Monitoring',
          description: highConfig.enhanced_monitoring.description,
          category: 'monitoring',
          priority: 'required',
        });
      }
    }
  }

  // Deduplicate by actionId
  const seen = new Set<string>();
  const deduped = actions.filter((action) => {
    if (seen.has(action.actionId)) {
      return false;
    }
    seen.add(action.actionId);
    return true;
  });

  return { actions: deduped, warnings };
}
