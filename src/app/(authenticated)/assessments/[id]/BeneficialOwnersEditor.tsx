'use client';

/**
 * Inline editor for the manually-entered list of beneficial owners to verify.
 * Rendered under the "Identify and verify all beneficial owners" requirement
 * on the assessment page. Names are stored in a single `assessment_evidence`
 * row with a sentinel `source` value so they appear under the requirement
 * (not in the evidence column).
 */

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { setBeneficialOwnerNames } from '@/app/actions/evidence';
import styles from './page.module.css';

interface BeneficialOwnersEditorProps {
  assessmentId: string;
  /** Current list of names (may be empty) */
  names: string[];
  /** When true the editor is read-only (after assessment finalisation) */
  isFinalised: boolean;
}

export function BeneficialOwnersEditor({
  assessmentId,
  names,
  isFinalised,
}: BeneficialOwnersEditorProps) {
  const router = useRouter();
  const [isEditing, setIsEditing] = useState(false);
  const [draft, setDraft] = useState<string[]>(names);
  const [newName, setNewName] = useState('');
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const startEdit = () => {
    setDraft(names);
    setNewName('');
    setError(null);
    setIsEditing(true);
  };

  const cancel = () => {
    setIsEditing(false);
    setDraft(names);
    setNewName('');
    setError(null);
  };

  const addDraftName = () => {
    const trimmed = newName.trim();
    if (!trimmed) return;
    if (draft.some(n => n.toLowerCase() === trimmed.toLowerCase())) {
      setError('That name is already in the list');
      return;
    }
    setDraft([...draft, trimmed]);
    setNewName('');
    setError(null);
  };

  const removeDraftName = (idx: number) => {
    setDraft(draft.filter((_, i) => i !== idx));
  };

  const save = () => {
    setError(null);
    startTransition(async () => {
      const result = await setBeneficialOwnerNames(assessmentId, draft);
      if (!result.success) {
        setError(result.error);
        return;
      }
      setIsEditing(false);
      router.refresh();
    });
  };

  // ── Read-only display ──
  // Finalised assessments are locked — the BO list is captured during the
  // assessment flow before finalisation. (Pre-feature assessments require a
  // one-off DB amendment.)
  if (!isEditing) {
    if (names.length === 0) {
      return (
        <div className={styles.boEditorEmpty}>
          {isFinalised ? (
            <span className={styles.boEditorEmptyText}>No beneficial owners recorded.</span>
          ) : (
            <>
              <span className={styles.boEditorEmptyText}>No beneficial owners listed yet.</span>
              <button type="button" className={styles.boEditorAddButton} onClick={startEdit}>
                Add beneficial owners
              </button>
            </>
          )}
        </div>
      );
    }
    return (
      <div className={styles.personList}>
        <div className={styles.personListLabel}>
          {names.length === 1 ? 'Beneficial owner' : `${names.length} beneficial owners`}
        </div>
        <ul className={styles.personListItems}>
          {names.map((name, i) => (
            <li key={i} className={styles.personListItem}>{name}</li>
          ))}
        </ul>
        {!isFinalised && (
          <button type="button" className={styles.boEditorEditButton} onClick={startEdit}>
            Edit list
          </button>
        )}
      </div>
    );
  }

  // ── Edit mode ──
  return (
    <div className={styles.boEditor}>
      <div className={styles.personListLabel}>Beneficial owners to verify</div>
      {draft.length > 0 && (
        <ul className={styles.boEditorList}>
          {draft.map((name, i) => (
            <li key={i} className={styles.boEditorListItem}>
              <span>{name}</span>
              <button
                type="button"
                className={styles.boEditorRemoveButton}
                onClick={() => removeDraftName(i)}
                disabled={isPending}
                aria-label={`Remove ${name}`}
              >
                Remove
              </button>
            </li>
          ))}
        </ul>
      )}
      <div className={styles.boEditorAddRow}>
        <input
          type="text"
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              addDraftName();
            }
          }}
          placeholder="Full name of beneficial owner"
          className={styles.boEditorInput}
          disabled={isPending}
        />
        <button
          type="button"
          className={styles.boEditorAddButton}
          onClick={addDraftName}
          disabled={isPending || !newName.trim()}
        >
          Add
        </button>
      </div>
      {error && <div className={styles.boEditorError}>{error}</div>}
      <div className={styles.boEditorActions}>
        <button
          type="button"
          className={styles.boEditorSaveButton}
          onClick={save}
          disabled={isPending}
        >
          {isPending ? 'Saving...' : 'Save list'}
        </button>
        <button
          type="button"
          className={styles.boEditorCancelButton}
          onClick={cancel}
          disabled={isPending}
        >
          Cancel
        </button>
      </div>
    </div>
  );
}
