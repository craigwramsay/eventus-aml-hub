'use client';

/**
 * Integration Card Actions
 *
 * Client component for Connect/Disconnect buttons on the integrations settings page.
 */

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { disconnectIntegration, registerAmiqusWebhookForFirm } from '@/app/actions/integrations';
import type { IntegrationProvider } from '@/lib/supabase/types';
import styles from './page.module.css';

interface IntegrationCardsProps {
  provider: IntegrationProvider;
  isConfigured: boolean;
  isConnected: boolean;
  hasWebhook?: boolean;
}

export function IntegrationCards({ provider, isConfigured, isConnected, hasWebhook }: IntegrationCardsProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const handleDisconnect = () => {
    setError(null);
    setSuccess(null);
    startTransition(async () => {
      const result = await disconnectIntegration(provider);
      if (!result.success) {
        setError(result.error);
      } else {
        router.refresh();
      }
    });
  };

  const handleRegisterAmiqusWebhook = () => {
    setError(null);
    setSuccess(null);
    startTransition(async () => {
      const result = await registerAmiqusWebhookForFirm();
      if (!result.success) {
        setError(result.error);
      } else {
        setSuccess(hasWebhook ? 'Webhook re-registered successfully.' : 'Webhook registered successfully.');
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
      {success && <div className={`${styles.alert} ${styles.alertSuccess}`}>{success}</div>}

      {provider === 'clio' ? (
        isConnected ? (
          <button
            type="button"
            className={styles.disconnectButton}
            onClick={handleDisconnect}
            disabled={isPending}
          >
            {isPending ? 'Disconnecting...' : 'Disconnect'}
          </button>
        ) : (
          <a
            href="/api/integrations/clio/connect"
            className={styles.connectButton}
          >
            Connect to Clio
          </a>
        )
      ) : (
        <>
          <button
            type="button"
            className={styles.connectButton}
            onClick={handleRegisterAmiqusWebhook}
            disabled={isPending}
          >
            {isPending
              ? (hasWebhook ? 'Re-registering...' : 'Registering...')
              : (hasWebhook ? 'Re-register Webhook' : 'Register Webhook')}
          </button>
          {isConnected && (
            <button
              type="button"
              className={styles.disconnectButton}
              onClick={handleDisconnect}
              disabled={isPending}
            >
              {isPending ? 'Disconnecting...' : 'Disconnect'}
            </button>
          )}
        </>
      )}
    </div>
  );
}
