-- Seed migration: Insert initial regulatory baseline from static config
-- and create config versions for existing firms that have been actively used.
--
-- This migration ensures backward compatibility:
-- - Existing firms get an 'active' config version from current static defaults
-- - The regulatory baseline is loaded from the static JSON file
-- - New assessments will link to the firm's config version
-- - Existing assessments remain unaffected (they have their own snapshots)

-- Insert the initial regulatory baseline (v1)
-- The baseline_rules JSON matches src/config/platform/regulatory_baseline_v1.json
INSERT INTO regulatory_baseline (version_number, baseline_rules, status, change_summary)
VALUES (
  1,
  '{
    "version": "1.0",
    "effectiveDate": "2026-02-26",
    "authorities": ["MLR 2017", "LSAG 2025", "POCA 2002"],
    "scoring": {
      "maxHighThresholdMin": 12,
      "mandatoryFactors": [
        {"factorId": "pep_or_rca", "description": "PEP or Relative/Close Associate status must be assessed", "authority": "MLR 2017, reg. 35", "minimumHighScore": 3},
        {"factorId": "country_risk", "description": "Country/jurisdiction risk must be assessed", "authority": "MLR 2017, reg. 33(1)(a)"},
        {"factorId": "source_of_funds", "description": "Source of funds must be assessed", "authority": "MLR 2017, reg. 28(12)"},
        {"factorId": "client_account_funds", "description": "Whether client account funds are involved must be assessed", "authority": "LSAG 2025 §6.2.3"},
        {"factorId": "existing_or_new_client", "description": "Whether client is new or existing must be assessed", "authority": "MLR 2017, reg. 28(2)"}
      ],
      "mandatoryAutomaticOutcomes": [
        {"outcomeId": "HIGH_RISK_EDD_REQUIRED", "description": "PEP status and client account funds must trigger automatic HIGH risk with EDD", "authority": "MLR 2017, reg. 35; LSAG 2025 §6.2.3"},
        {"outcomeId": "OUT_OF_APPETITE", "description": "Prohibited sectors, FATF blacklist, and CDD refusal must trigger out-of-appetite", "authority": "MLR 2017, reg. 31(1)"}
      ],
      "mandatoryEddTriggers": [
        {"triggerId": "client_account", "description": "Client account fund receipt must trigger EDD actions", "authority": "LSAG 2025 §6.2.3"},
        {"triggerId": "tcsp_activity", "description": "TCSP activity must trigger EDD actions", "authority": "MLR 2017, reg. 14"}
      ]
    },
    "cdd": {
      "mandatoryActions": [
        {"actionId": "verify_identity", "description": "Verify client identity using reliable and independent sources", "authority": "MLR 2017, reg. 28(2)", "appliesTo": {"clientTypes": ["individual", "corporate"], "riskLevels": ["LOW", "MEDIUM", "HIGH"]}},
        {"actionId": "assess_purpose_nature", "description": "Assess the purpose and intended nature of the business relationship", "authority": "MLR 2017, reg. 28(5)", "appliesTo": {"clientTypes": ["individual", "corporate"], "riskLevels": ["LOW", "MEDIUM", "HIGH"]}},
        {"actionId": "beneficial_ownership", "description": "Identify and verify beneficial owners for corporate entities", "authority": "MLR 2017, reg. 28(3)", "appliesTo": {"clientTypes": ["corporate"], "riskLevels": ["LOW", "MEDIUM", "HIGH"]}},
        {"actionId": "ongoing_monitoring", "description": "Conduct ongoing monitoring of the business relationship", "authority": "MLR 2017, reg. 28(11)", "appliesTo": {"clientTypes": ["individual", "corporate"], "riskLevels": ["LOW", "MEDIUM", "HIGH"]}},
        {"actionId": "pep_screening", "description": "Screen for PEP status and apply enhanced measures if identified", "authority": "MLR 2017, reg. 35", "appliesTo": {"clientTypes": ["individual"], "riskLevels": ["LOW", "MEDIUM", "HIGH"]}},
        {"actionId": "sanctions_check", "description": "Check against sanctions lists", "authority": "POCA 2002 s.330; MLR 2017, reg. 33(1)", "appliesTo": {"clientTypes": ["individual", "corporate"], "riskLevels": ["LOW", "MEDIUM", "HIGH"]}}
      ],
      "eddRequiredAtHigh": true,
      "sowRequiredAtMediumPlus": true,
      "sofRequiredAtHigh": true,
      "ongoingMonitoringRequired": true
    },
    "sectorMapping": {
      "mandatoryProhibited": ["Weapons or defence brokering", "Shell company with no legitimate purpose", "Unlicensed money services", "Opaque ownership structure with unverifiable BO"]
    },
    "staleness": {
      "maxMonths": {"HIGH": 12, "MEDIUM": 24, "LOW": 36}
    }
  }'::jsonb,
  'active',
  'Initial regulatory baseline - MLR 2017, LSAG 2025, POCA 2002'
)
ON CONFLICT (version_number) DO NOTHING;
