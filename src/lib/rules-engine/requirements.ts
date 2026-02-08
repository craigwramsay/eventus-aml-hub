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
} from './types';

/**
 * Map CDD action to MandatoryAction
 */
function mapCDDAction(
  action: CDDAction,
  category: MandatoryAction['category'],
  priority: MandatoryAction['priority']
): MandatoryAction {
  return {
    actionId: action.action,
    actionName: action.action.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase()),
    description: action.description,
    category,
    priority,
  };
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

/**
 * Get the appropriate CDD client type key from our client type
 */
function getCDDClientTypeKey(
  clientType: ClientType,
  formAnswers?: Record<string, string | string[]>
): keyof CDDRulesetConfig['clientTypes'] {
  if (clientType === 'individual') {
    return 'individual';
  }

  // For corporate, could be company, LLP, or partnership
  // Default to UK private limited company for now
  // Could be enhanced to check form field for entity type
  if (formAnswers) {
    const entityType = formAnswers['10']; // Entity type field
    if (typeof entityType === 'string') {
      if (entityType.includes('LLP') || entityType.includes('Partnership')) {
        return 'uk_llp';
      }
    }
  }

  return 'uk_private_limited_company';
}

/**
 * Get mandatory actions for a given risk level and client type
 */
export function getMandatoryActions(
  clientType: ClientType,
  riskLevel: RiskLevel,
  config: CDDRulesetConfig,
  formAnswers?: Record<string, string | string[]>
): MandatoryAction[] {
  const clientTypeKey = getCDDClientTypeKey(clientType, formAnswers);
  const clientConfig = config.clientTypes[clientTypeKey];

  if (!clientConfig) {
    return [];
  }

  const riskConfig = clientConfig.riskLevels[riskLevel];
  if (!riskConfig) {
    return [];
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

  // Deduplicate by actionId
  const seen = new Set<string>();
  return actions.filter((action) => {
    if (seen.has(action.actionId)) {
      return false;
    }
    seen.add(action.actionId);
    return true;
  });
}
