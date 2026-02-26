'use client';

/**
 * Integration Card Actions
 *
 * Client component for Connect/Disconnect buttons on the integrations settings page.
 */

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { disconnectIntegration } from '@/app/actions/integrations';
import type { IntegrationProvider } from '@/lib/supabase/types';
import styles from './page.module.css';

interface IntegrationCardsProps {
  provider: IntegrationProvider;
  isConfigured: boolean;
  isConnected: boolean;
}

export function IntegrationCards({ provider, isConfigured, isConnected }: IntegrationCardsProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const handleDisconnect = () => {
    setError(null);
    startTransition(async () => {
      const result = await disconnectIntegration(provider);
      if (!result.success) {
        setError(result.error);
      } else {
        router.refresh();
      }
    });
  };

  if (!isConfigured) {
    return null;
  }

  return (
    <div className={styles.cardActions}>
      {error && <div className={`${styles.alert} ${styles.alertError}`}>{error}</div>}

      {isConnected ? (
        <button
          type="button"
          className={styles.disconnectButton}
          onClick={handleDisconnect}
          disabled={isPending}
        >
          {isPending ? 'Disconnecting...' : 'Disconnect'}
        </button>
      ) : provider === 'clio' ? (
        <a
          href="/api/integrations/clio/connect"
          className={styles.connectButton}
        >
          Connect to Clio
        </a>
      ) : (
        <span style={{ fontSize: '0.875rem', color: 'var(--text-secondary)' }}>
          Amiqus is ready to use via PAT authentication.
        </span>
      )}
    </div>
  );
}
