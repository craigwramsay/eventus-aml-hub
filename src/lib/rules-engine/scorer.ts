/**
 * Scorer module for the Eventus AML Rules Engine
 * Calculates risk scores based on form answers and config
 * No hardcoded rules - all logic driven by config
 */

import type {
  ClientType,
  FormAnswers,
  RiskLevel,
  RiskFactorResult,
  AutomaticOutcomeResult,
  ScoringFactor,
  ScoringOption,
  ScoringSection,
  RiskScoringConfig,
} from './types';

/**
 * Match a form answer to a scoring option
 */
function matchAnswer(
  formAnswer: string | string[],
  option: ScoringOption
): boolean {
  const answer = Array.isArray(formAnswer) ? formAnswer[0] : formAnswer;

  // Direct match
  if (option.answer === answer) {
    return true;
  }

  // formAnswer mapping (exact match)
  if (option.formAnswer && option.formAnswer === answer) {
    return true;
  }

  // formAnswers array (any match)
  if (option.formAnswers && option.formAnswers.includes(answer)) {
    return true;
  }

  // formAnswerPrefix (starts with)
  if (option.formAnswerPrefix && answer.startsWith(option.formAnswerPrefix)) {
    return true;
  }

  return false;
}

/**
 * Score a single factor based on form answer
 */
function scoreFactor(
  factor: ScoringFactor,
  formAnswers: FormAnswers
): RiskFactorResult | null {
  // Skip non-scored factors
  if (factor.scored === false) {
    return null;
  }

  // Get form answer
  const formAnswer = formAnswers[factor.formFieldId];
  if (formAnswer === undefined || formAnswer === null || formAnswer === '') {
    return null;
  }

  // Find matching option
  if (!factor.options) {
    return null;
  }

  for (const option of factor.options) {
    if (matchAnswer(formAnswer, option)) {
      // Handle automatic outcomes (no score, triggers outcome)
      if (option.outcome) {
        return {
          factorId: factor.id,
          factorLabel: factor.label,
          formFieldId: factor.formFieldId,
          selectedAnswer: formAnswer,
          score: 0,
          rationale: `${factor.label}: "${option.answer}" triggers ${option.outcome}`,
        };
      }

      // Normal scoring
      const score = option.score ?? 0;
      const rationale =
        score > 0
          ? `${factor.label}: "${option.answer}" adds +${score} to risk score`
          : `${factor.label}: "${option.answer}" (no additional risk)`;

      return {
        factorId: factor.id,
        factorLabel: factor.label,
        formFieldId: factor.formFieldId,
        selectedAnswer: formAnswer,
        score,
        rationale,
      };
    }
  }

  // No match found
  return null;
}

/**
 * Check for automatic outcome triggers
 */
function checkAutomaticOutcomes(
  config: RiskScoringConfig,
  clientType: ClientType,
  formAnswers: FormAnswers,
  factorResults: RiskFactorResult[]
): AutomaticOutcomeResult | null {
  const sections =
    clientType === 'corporate'
      ? config.scoringFactors.corporate
      : config.scoringFactors.individual;

  // Check each factor for outcome triggers
  for (const section of Object.values(sections)) {
    for (const factor of section.factors) {
      if (!factor.options) continue;

      const formAnswer = formAnswers[factor.formFieldId];
      if (!formAnswer) continue;

      for (const option of factor.options) {
        if (option.outcome && matchAnswer(formAnswer, option)) {
          const outcome = config.automaticOutcomes[option.outcome];
          if (outcome) {
            return {
              outcomeId: option.outcome,
              description: outcome.description,
              triggeredBy: `${factor.label}: "${option.answer}"`,
            };
          }
        }
      }
    }
  }

  return null;
}

/**
 * Determine risk level from score based on config thresholds
 */
export function scoreToRiskLevel(
  score: number,
  config: RiskScoringConfig
): RiskLevel {
  for (const level of config.riskLevels) {
    const threshold = config.thresholds[level];
    const meetsMin = score >= threshold.min;
    const meetsMax = threshold.max === null || score <= threshold.max;
    if (meetsMin && meetsMax) {
      return level;
    }
  }
  // Default to highest risk if no match (shouldn't happen with proper config)
  return config.riskLevels[config.riskLevels.length - 1];
}

/**
 * Calculate risk score and factors from form answers
 */
export function calculateScore(
  clientType: ClientType,
  formAnswers: FormAnswers,
  config: RiskScoringConfig
): {
  score: number;
  riskLevel: RiskLevel;
  riskFactors: RiskFactorResult[];
  automaticOutcome: AutomaticOutcomeResult | null;
} {
  const sections: Record<string, ScoringSection> =
    clientType === 'corporate'
      ? config.scoringFactors.corporate
      : config.scoringFactors.individual;

  const riskFactors: RiskFactorResult[] = [];
  let totalScore = 0;

  // Process each section and factor
  for (const section of Object.values(sections)) {
    for (const factor of section.factors) {
      const result = scoreFactor(factor, formAnswers);
      if (result) {
        riskFactors.push(result);
        totalScore += result.score;
      }
    }
  }

  // Check for automatic outcomes
  const automaticOutcome = checkAutomaticOutcomes(
    config,
    clientType,
    formAnswers,
    riskFactors
  );

  // If automatic outcome triggers HIGH risk, override
  let riskLevel = scoreToRiskLevel(totalScore, config);
  if (
    automaticOutcome &&
    automaticOutcome.outcomeId === 'HIGH_RISK_EDD_REQUIRED'
  ) {
    riskLevel = 'HIGH';
  }

  return {
    score: totalScore,
    riskLevel,
    riskFactors,
    automaticOutcome,
  };
}

/**
 * Generate rationale strings from factor results
 */
export function generateRationale(
  score: number,
  riskLevel: RiskLevel,
  riskFactors: RiskFactorResult[],
  automaticOutcome: AutomaticOutcomeResult | null,
  config: RiskScoringConfig
): string[] {
  const rationale: string[] = [];

  // Overall assessment
  rationale.push(
    `Risk assessment: ${riskLevel} (score: ${score})`
  );

  // Threshold explanation
  const threshold = config.thresholds[riskLevel];
  if (threshold.max === null) {
    rationale.push(
      `Score of ${score} meets ${riskLevel} threshold (${threshold.min}+)`
    );
  } else {
    rationale.push(
      `Score of ${score} falls within ${riskLevel} range (${threshold.min}-${threshold.max})`
    );
  }

  // Automatic outcome if triggered
  if (automaticOutcome) {
    rationale.push(
      `AUTOMATIC OUTCOME: ${automaticOutcome.description}`
    );
    rationale.push(`Triggered by: ${automaticOutcome.triggeredBy}`);
  }

  // Contributing factors (only those that added to score)
  const contributingFactors = riskFactors.filter((f) => f.score > 0);
  if (contributingFactors.length > 0) {
    rationale.push('');
    rationale.push('Contributing risk factors:');
    for (const factor of contributingFactors) {
      rationale.push(`  - ${factor.rationale}`);
    }
  }

  return rationale;
}
