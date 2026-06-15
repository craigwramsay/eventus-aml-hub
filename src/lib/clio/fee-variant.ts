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
