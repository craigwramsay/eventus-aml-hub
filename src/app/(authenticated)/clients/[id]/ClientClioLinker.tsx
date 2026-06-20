'use client';

import { useState, useEffect, useRef, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import {
  findMatchingClioContacts,
  linkClientToClio,
  unlinkClientFromClio,
} from '@/app/actions/clients';
import type { ClioContactMatch } from '@/app/actions/clients';
import styles from '../clients.module.css';

interface ClientClioLinkerProps {
  clientId: string;
  clientName: string;
  clioContactId: string | null;
  canEdit: boolean;
  /** Pre-built Clio web URL for this contact, or null if unlinked. */
  clioContactUrl: string | null;
}

export function ClientClioLinker({
  clientId,
  clientName,
  clioContactId,
  canEdit,
  clioContactUrl,
}: ClientClioLinkerProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  // Link mode UI state
  const [isLinking, setIsLinking] = useState(false);
  const [searchTerm, setSearchTerm] = useState(clientName);
  const [matches, setMatches] = useState<ClioContactMatch[]>([]);
  const [searching, setSearching] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Confirmation state for picked match
  const [pendingMatch, setPendingMatch] = useState<ClioContactMatch | null>(null);
  const [renameToClioName, setRenameToClioName] = useState(true);

  // Debounced search whenever searchTerm changes in link mode
  useEffect(() => {
    if (!isLinking) return;
    const trimmed = searchTerm.trim();
    if (trimmed.length < 2) {
      setMatches([]);
      return;
    }
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(async () => {
      setSearching(true);
      try {
        const result = await findMatchingClioContacts(trimmed);
        if (result.success) setMatches(result.matches);
      } finally {
        setSearching(false);
      }
    }, 400);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [searchTerm, isLinking]);

  const handlePickMatch = (m: ClioContactMatch) => {
    if (m.alreadyInHub && m.hubClientId) {
      router.push(`/clients/${m.hubClientId}`);
      return;
    }
    setPendingMatch(m);
    // Default to renaming if the names differ
    setRenameToClioName(m.name !== clientName);
  };

  const handleConfirmLink = () => {
    if (!pendingMatch) return;
    setError(null);
    startTransition(async () => {
      const result = await linkClientToClio(clientId, pendingMatch.clioContactId, {
        renameToName: renameToClioName ? pendingMatch.name : undefined,
      });
      if (result.success) {
        setIsLinking(false);
        setPendingMatch(null);
        router.refresh();
      } else if (result.existingClientId) {
        router.push(`/clients/${result.existingClientId}`);
      } else {
        setError(result.error);
      }
    });
  };

  const handleUnlink = () => {
    if (!window.confirm('Remove the Clio link from this client?')) return;
    setError(null);
    startTransition(async () => {
      const result = await unlinkClientFromClio(clientId);
      if (result.success) {
        router.refresh();
      } else {
        setError(result.error);
      }
    });
  };

  // ── LINKED state ─────────────────────────────────────────────────────
  if (clioContactId) {
    return (
      <div className={styles.clioLinkDisplay}>
        <span className={styles.clioLinkedLabel}>
          <span className={styles.clioLinkedDot} aria-hidden />{' '}
          {clioContactUrl ? (
            <a
              href={clioContactUrl}
              target="_blank"
              rel="noopener noreferrer"
              className={styles.clioLinkedAnchor}
              title="Open this contact in Clio"
            >
              Linked to Clio (contact ID <code>{clioContactId}</code>) ↗
            </a>
          ) : (
            <>
              Linked to Clio (contact ID <code>{clioContactId}</code>)
            </>
          )}
        </span>
        {canEdit && (
          <button
            type="button"
            className={styles.clioLinkAction}
            onClick={handleUnlink}
            disabled={isPending}
          >
            {isPending ? 'Unlinking…' : 'Unlink'}
          </button>
        )}
        {error && <div className={styles.clioLinkError}>{error}</div>}
      </div>
    );
  }

  // ── UNLINKED, edit not allowed ───────────────────────────────────────
  if (!canEdit) {
    return (
      <div className={styles.clioLinkDisplay}>
        <span className={styles.clioUnlinkedLabel}>Not linked to Clio</span>
      </div>
    );
  }

  // ── UNLINKED, not in link mode ───────────────────────────────────────
  if (!isLinking) {
    return (
      <div className={styles.clioLinkDisplay}>
        <span className={styles.clioUnlinkedLabel}>Not linked to Clio</span>
        <button
          type="button"
          className={styles.clioLinkAction}
          onClick={() => {
            setSearchTerm(clientName);
            setMatches([]);
            setPendingMatch(null);
            setError(null);
            setIsLinking(true);
          }}
        >
          Link to Clio
        </button>
        {error && <div className={styles.clioLinkError}>{error}</div>}
      </div>
    );
  }

  // ── LINKING: confirmation step ───────────────────────────────────────
  if (pendingMatch) {
    const namesDiffer = pendingMatch.name !== clientName;
    return (
      <div className={styles.clioLinkConfirm}>
        <div>
          About to link this Hub client to Clio contact:
          <div className={styles.clioLinkConfirmRow}>
            <strong>{pendingMatch.name}</strong>{' '}
            <span className={styles.clioMatchMeta}>
              ({pendingMatch.type} · contact ID {pendingMatch.clioContactId})
            </span>
          </div>
        </div>
        {namesDiffer && (
          <label className={styles.clioRenameOption}>
            <input
              type="checkbox"
              checked={renameToClioName}
              onChange={(e) => setRenameToClioName(e.target.checked)}
              disabled={isPending}
            />
            Also rename this Hub client from <strong>{clientName}</strong> to{' '}
            <strong>{pendingMatch.name}</strong>
          </label>
        )}
        <div className={styles.clioLinkConfirmActions}>
          <button
            type="button"
            className={styles.primaryButton}
            onClick={handleConfirmLink}
            disabled={isPending}
          >
            {isPending ? 'Linking…' : 'Confirm link'}
          </button>
          <button
            type="button"
            className={styles.deleteCancelButton}
            onClick={() => setPendingMatch(null)}
            disabled={isPending}
          >
            Back
          </button>
        </div>
        {error && <div className={styles.clioLinkError}>{error}</div>}
      </div>
    );
  }

  // ── LINKING: search step ─────────────────────────────────────────────
  return (
    <div className={styles.clioLinkSearch}>
      <div className={styles.clioLinkSearchRow}>
        <input
          type="text"
          className={styles.input}
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          placeholder="Type a Clio contact name…"
          autoFocus
          disabled={isPending}
        />
        <button
          type="button"
          className={styles.deleteCancelButton}
          onClick={() => {
            setIsLinking(false);
            setMatches([]);
            setError(null);
          }}
          disabled={isPending}
        >
          Cancel
        </button>
      </div>
      {searching && matches.length === 0 && (
        <div className={styles.clioMatchesHint}>Searching Clio…</div>
      )}
      {!searching && searchTerm.trim().length >= 2 && matches.length === 0 && (
        <div className={styles.clioMatchesHint}>No Clio matches for that name.</div>
      )}
      {matches.length > 0 && (
        <ul className={styles.clioMatchesList}>
          {matches.map((m) => (
            <li key={m.clioContactId} className={styles.clioMatchRow}>
              <div className={styles.clioMatchInfo}>
                <span className={styles.clioMatchName}>
                  {m.name}
                  {m.exactMatch && <em className={styles.clioMatchExact}> (exact match)</em>}
                </span>
                <span className={styles.clioMatchMeta}>
                  {m.type}
                  {m.alreadyInHub && ' · already linked to another Hub client'}
                </span>
              </div>
              <button
                type="button"
                className={styles.clioMatchButton}
                onClick={() => handlePickMatch(m)}
                disabled={isPending}
              >
                {m.alreadyInHub ? 'Open existing' : 'Use this contact'}
              </button>
            </li>
          ))}
        </ul>
      )}
      {error && <div className={styles.clioLinkError}>{error}</div>}
    </div>
  );
}
