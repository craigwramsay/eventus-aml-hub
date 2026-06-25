/**
 * Server-side mirror of CDDChecklist.tsx's item numbering.
 *
 * The UI numbers actions 1..N globally — first walking the non-EDD categories
 * in CATEGORY_ORDER and the natural order of mandatoryActions, then continuing
 * into the EDD section. This helper reproduces that walk so the server can
 * label evidence files (e.g. file notes synced to Clio Drive) with the same
 * number the user sees on screen.
 *
 * Returns null when the action isn't present in mandatoryActions.
 */

const CATEGORY_ORDER = ['cdd', 'edd', 'sow', 'sof', 'escalation', 'monitoring'];

export interface ChecklistAction {
  actionId: string;
  category?: string;
  displayText?: string;
  description?: string;
}

export interface ChecklistItemInfo {
  number: number;
  /** Human-readable requirement text (prefers displayText, falls back to description). */
  label: string;
}

export function computeChecklistItemInfo(
  mandatoryActions: ChecklistAction[],
  actionId: string
): ChecklistItemInfo | null {
  if (!Array.isArray(mandatoryActions) || mandatoryActions.length === 0) return null;

  const nonEdd = mandatoryActions.filter(a => a.category !== 'edd');
  const edd = mandatoryActions.filter(a => a.category === 'edd');

  // Group non-EDD by category, then sort categories by CATEGORY_ORDER.
  const groups: Record<string, ChecklistAction[]> = {};
  for (const a of nonEdd) {
    const cat = a.category || 'cdd';
    if (!groups[cat]) groups[cat] = [];
    groups[cat].push(a);
  }
  const sortedCategories = Object.keys(groups).sort((a, b) => {
    const ai = CATEGORY_ORDER.indexOf(a);
    const bi = CATEGORY_ORDER.indexOf(b);
    return (ai === -1 ? 999 : ai) - (bi === -1 ? 999 : bi);
  });

  let num = 0;
  for (const cat of sortedCategories) {
    for (const a of groups[cat]) {
      num++;
      if (a.actionId === actionId) {
        return { number: num, label: a.displayText || a.description || a.actionId };
      }
    }
  }
  for (const a of edd) {
    num++;
    if (a.actionId === actionId) {
      return { number: num, label: a.displayText || a.description || a.actionId };
    }
  }
  return null;
}
