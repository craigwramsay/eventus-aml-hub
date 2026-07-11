/**
 * Conservative person-name normaliser for matching individuals across
 * verification records (e.g. matching a director / beneficial owner on the
 * current assessment against prior Amiqus verifications for the same client).
 *
 * Rules applied (all safe, no false-positive risk):
 *   - lowercase
 *   - trim + collapse internal whitespace
 *   - strip honorifics anywhere in the string (Mr, Mrs, Ms, Mx, Miss, Dr,
 *     Sir, Dame, Lord, Lady, Prof, Rev) — with or without trailing dot
 *   - normalise "Smith, John" → "john smith" (comma-reversed format used by
 *     Companies House officer listings)
 *   - strip commas
 *
 * Deliberately NOT done:
 *   - Initialism vs full forename ("J Smith" vs "John Smith" could be the
 *     same person OR a different one)
 *   - Middle name tolerance ("John Smith" vs "John A. Smith")
 *   - Levenshtein / typo tolerance
 *
 * Anything that doesn't match exactly after normalisation falls through to
 * "no prior verification found" and the user adds a fresh one.
 */

const HONORIFICS = new Set([
  'mr',
  'mrs',
  'ms',
  'mx',
  'miss',
  'dr',
  'sir',
  'dame',
  'lord',
  'lady',
  'prof',
  'professor',
  'rev',
  'reverend',
]);

export function normalizePersonName(name: string): string {
  let s = name.toLowerCase().trim();
  // Collapse whitespace
  s = s.replace(/\s+/g, ' ');

  // Companies House "Surname, Forename(s)" format → "forename(s) surname"
  // Only flip on a single top-level comma; if there are multiple commas the
  // shape is ambiguous, leave it alone.
  const commaCount = (s.match(/,/g) || []).length;
  if (commaCount === 1) {
    const [surname, forenames] = s.split(',').map((p) => p.trim());
    if (surname && forenames) {
      s = `${forenames} ${surname}`;
    }
  }

  // Strip any remaining commas
  s = s.replace(/,/g, ' ');

  // Strip honorifics — token-by-token so we don't accidentally chew into
  // longer words ("Drake" should not lose its "Dr").
  const tokens = s
    .split(' ')
    .map((t) => t.replace(/\.$/, ''))
    .filter((t) => t.length > 0 && !HONORIFICS.has(t));
  s = tokens.join(' ');

  // Final whitespace tidy
  s = s.replace(/\s+/g, ' ').trim();
  return s;
}
