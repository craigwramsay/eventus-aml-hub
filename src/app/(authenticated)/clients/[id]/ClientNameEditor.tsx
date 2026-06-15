'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { renameClient } from '@/app/actions/clients';
import styles from '../clients.module.css';

interface ClientNameEditorProps {
  clientId: string;
  initialName: string;
  canEdit: boolean;
}

export function ClientNameEditor({ clientId, initialName, canEdit }: ClientNameEditorProps) {
  const router = useRouter();
  const [isEditing, setIsEditing] = useState(false);
  const [draft, setDraft] = useState(initialName);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  if (!isEditing) {
    return (
      <div className={styles.nameEditDisplay}>
        <h1 className={styles.title}>{initialName}</h1>
        {canEdit && (
          <button
            type="button"
            className={styles.nameEditButton}
            onClick={() => {
              setDraft(initialName);
              setError(null);
              setIsEditing(true);
            }}
            aria-label="Edit client name"
            title="Edit client name"
          >
            Edit
          </button>
        )}
      </div>
    );
  }

  const handleSave = () => {
    setError(null);
    const trimmed = draft.trim();
    if (!trimmed) {
      setError('Client name cannot be empty');
      return;
    }
    if (trimmed === initialName) {
      setIsEditing(false);
      return;
    }
    startTransition(async () => {
      const result = await renameClient(clientId, trimmed);
      if (!result.success) {
        setError(result.error);
        return;
      }
      setIsEditing(false);
      router.refresh();
    });
  };

  return (
    <div className={styles.nameEditEditing}>
      <input
        type="text"
        className={styles.nameEditInput}
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        disabled={isPending}
        autoFocus
        aria-label="Client name"
        onKeyDown={(e) => {
          if (e.key === 'Enter') handleSave();
          if (e.key === 'Escape') {
            setIsEditing(false);
            setError(null);
          }
        }}
      />
      <button
        type="button"
        className={styles.nameEditSave}
        onClick={handleSave}
        disabled={isPending}
      >
        {isPending ? 'Saving...' : 'Save'}
      </button>
      <button
        type="button"
        className={styles.nameEditCancel}
        onClick={() => {
          setIsEditing(false);
          setError(null);
        }}
        disabled={isPending}
      >
        Cancel
      </button>
      {error && <div className={styles.nameEditError}>{error}</div>}
    </div>
  );
}
