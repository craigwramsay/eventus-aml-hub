/**
 * Fee-variant matter detection — shared between the bulk cleanup action and
 * the live-import skip filter in the webhook handler + backfill action.
 *
 * Clio creates a separate matter when an interim fee is posted on an existing
 * matter. The variant's description is the main's description plus a
 * separator + a fee/disbursement/note keyword:
 *
 *   main:    "Group restructure 2025"
 *   variant: "Group restructure 2025 - Interim Fee Note"
 *
 * Variant matters have zero AML significance — the work was already assessed
 * under the main matter. They should not be brought into the Hub.
 */

const FEE_VARIANT_SUFFIX_PATTERN =
  /^[\s\-–—|:·]+(.*\b(interim|final|fee|fees|disbursement|disbursements|note|notes|invoice|payment|costs?)\b)/i;

/**
 * Test whether `candidate` looks like a fee-variant of `main` description.
 * Returns true iff:
 *   - main (trimmed, lowercased) is a strict prefix of candidate (trimmed, lowercased)
 *   - the suffix starts with a separator
 *   - the suffix contains a fee/disbursement/note keyword
 */
export function isFeeVariantOf(candidate: string, main: string): boolean {
  const candidateTrimmed = candidate.trim();
  const mainTrimmed = main.trim();
  if (!candidateTrimmed || !mainTrimmed) return false;
  const candidateLower = candidateTrimmed.toLowerCase();
  const mainLower = mainTrimmed.toLowerCase();
  if (mainLower.length >= candidateLower.length) return false;
  if (!candidateLower.startsWith(mainLower)) return false;
  const suffix = candidateTrimmed.slice(mainTrimmed.length);
  return FEE_VARIANT_SUFFIX_PATTERN.test(suffix);
}

/**
 * Given a candidate matter description, find an existing matter description
 * from `existingDescriptions` that it appears to be a fee-variant of.
 * Returns the matching main description, or null if no match.
 */
export function findFeeVariantMain(
  candidateDescription: string,
  existingDescriptions: string[]
): string | null {
  for (const existing of existingDescriptions) {
    if (isFeeVariantOf(candidateDescription, existing)) return existing;
  }
  return null;
}

/**
 * Standalone-admin matter detection — Clio matters that are pure bookkeeping
 * or admin records, not real legal matters with AML implications.
 *
 * Independent of any related main matter (unlike fee variants which need a
 * prefix-relationship to be detected). Catches three patterns the user
 * identified:
 *
 *   - "Retainer - <Location>"  — Clio email-folder matters per office,
 *                                created to organise incoming emails per region
 *   - "PAYABLE BY X"           — fee receivable from a third party
 *   - "RECEIVABLE FROM X"      — same family, occasional variant
 *
 * Conservative — only matches the exact start pattern. "Annual Retainer 2026"
 * doesn't match (doesn't start with "Retainer"); "Retainer Agreement" doesn't
 * match (no separator). Won't false-positive on real legal matters that
 * mention these words mid-description.
 */
const STANDALONE_ADMIN_PATTERN =
  /^\s*(retainer\s*[-–—|:·]\s*\S|payable\s+by\s+\S|receivable\s+from\s+\S)/i;

export function isStandaloneAdminMatter(description: string): boolean {
  return STANDALONE_ADMIN_PATTERN.test(description ?? '');
}

/**
 * Human-readable label for the admin category — used in skip diagnostics so
 * the user can tell at a glance which pattern triggered the skip.
 */
export function classifyStandaloneAdminMatter(description: string): string | null {
  const trimmed = (description ?? '').trim();
  if (/^retainer\s*[-–—|:·]/i.test(trimmed)) return 'retainer_folder';
  if (/^payable\s+by\s+/i.test(trimmed)) return 'payable_by';
  if (/^receivable\s+from\s+/i.test(trimmed)) return 'receivable_from';
  return null;
}
