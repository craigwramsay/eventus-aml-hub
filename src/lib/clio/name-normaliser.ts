/**
 * Conservative client name normaliser for matching Hub manual entries against
 * Clio contacts during backfill + duplicate detection.
 *
 * Rules applied (all safe, no false-positive risk):
 *   - lowercase
 *   - trim + collapse whitespace
 *   - strip trailing period after company suffixes (Ltd. → Ltd)
 *   - normalise "Ltd" / "Ltd." → "limited"
 *   - normalise LLP variants → "llp"
 *   - strip commas (the kind of stray comma that creeps into hand-typed names)
 *
 * Deliberately NOT done:
 *   - Levenshtein / typo tolerance (would auto-pair distinct clients with
 *     similar names)
 *   - middle name tolerance ("Andrew Goodwin" vs "Andrew John Goodwin" —
 *     could be the same person or two unrelated ones; let user decide)
 *
 * Anything the normaliser doesn't match falls through to "no manual candidate
 * found" and the user reviews via Inspect/Preview Duplicates.
 */
export function normalizeClientName(name: string): string {
  let s = name.toLowerCase().trim();
  // Collapse whitespace
  s = s.replace(/\s+/g, ' ');
  // Strip commas
  s = s.replace(/,/g, '');
  // Strip trailing period
  s = s.replace(/\.$/, '');
  // Ltd → limited (handle Ltd. and Ltd; word-boundary safe)
  s = s.replace(/\bltd\b\.?/g, 'limited');
  // LLP variants
  s = s.replace(/\bl\.l\.p\.?/g, 'llp');
  // Re-collapse whitespace in case substitutions introduced any
  s = s.replace(/\s+/g, ' ').trim();
  return s;
}
