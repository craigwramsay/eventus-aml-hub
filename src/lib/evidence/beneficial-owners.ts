/**
 * Helpers for the manually-entered "beneficial owners to verify" list.
 *
 * PSCs from Companies House are not always the beneficial owners who should be
 * verified for AML purposes — the firm captures this list manually. We persist
 * it as a special row in `assessment_evidence` (one per assessment) marked
 * with the sentinel source value below so it can be filtered out of the
 * normal evidence display.
 */

import type { AssessmentEvidence } from '@/lib/supabase/types';

/** Sentinel value placed in `assessment_evidence.source` to mark a BO list row. */
export const BO_LIST_SOURCE = '__bo_list__';

/** Human-readable label stored on the BO list evidence row. */
export const BO_LIST_LABEL = 'Beneficial owners to verify';

/** Action ID associated with the BO list row. */
export const BO_LIST_ACTION_ID = 'identify_and_verify_beneficial_owners';

/**
 * Return true if an evidence row is the BO list (used to filter out of
 * the user-facing evidence display).
 */
export function isBeneficialOwnerListRow(ev: { source?: string | null; action_id?: string | null }): boolean {
  return ev.source === BO_LIST_SOURCE && ev.action_id === BO_LIST_ACTION_ID;
}

/**
 * Extract the list of beneficial owner names from a set of assessment evidence rows.
 * Returns an empty array if no BO list has been set.
 */
export function extractBeneficialOwnerNames(evidence: AssessmentEvidence[]): string[] {
  const row = evidence.find(isBeneficialOwnerListRow);
  if (!row || !row.data || typeof row.data !== 'object') return [];
  const data = row.data as { names?: unknown };
  if (!Array.isArray(data.names)) return [];
  return data.names.filter((n): n is string => typeof n === 'string' && n.trim().length > 0);
}
