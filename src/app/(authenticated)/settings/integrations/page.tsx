import { redirect } from 'next/navigation';
import { getUserProfile } from '@/lib/supabase/server';
import { canManageIntegrations } from '@/lib/auth/roles';
import { getIntegrationStatus } from '@/app/actions/integrations';
import type { FirmIntegration } from '@/lib/supabase/types';
import { IntegrationCards } from './IntegrationCards';
import styles from './page.module.css';

interface PageProps {
  searchParams: Promise<{ connected?: string; error?: string }>;
}

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
}

function daysUntil(dateStr: string): number {
  const target = new Date(dateStr).getTime();
  const now = Date.now();
  return Math.ceil((target - now) / (1000 * 60 * 60 * 24));
}

export default async function IntegrationsSettingsPage({ searchParams }: PageProps) {
  const profile = await getUserProfile();
  if (!profile || !canManageIntegrations(profile.role)) {
    redirect('/dashboard');
  }

  const { connected, error: errorParam } = await searchParams;
  const result = await getIntegrationStatus();
  const integrations: FirmIntegration[] = result.success ? result.integrations : [];

  const clioIntegration = integrations.find((i) => i.provider === 'clio') || null;
  const amiqusIntegration = integrations.find((i) => i.provider === 'amiqus') || null;

  const clioConfigured = !!(process.env.CLIO_CLIENT_ID && process.env.CLIO_CLIENT_SECRET);
  const amiqusConfigured = !!process.env.AMIQUS_API_KEY;

  // Check Clio webhook expiry
  let clioWebhookDaysLeft: number | null = null;
  if (clioIntegration?.webhook_expires_at) {
    clioWebhookDaysLeft = daysUntil(clioIntegration.webhook_expires_at);
  }

  return (
    <>
      <header className={styles.header}>
        <h1 className={styles.title}>Integrations</h1>
        <p className={styles.subtitle}>
          Connect external services to sync data automatically.
        </p>
      </header>

      {connected && (
        <div className={`${styles.alert} ${styles.alertSuccess}`}>
          {connected === 'clio' && 'Clio has been connected successfully.'}
          {connected === 'amiqus' && 'Amiqus has been connected successfully.'}
        </div>
      )}

      {errorParam && (
        <div className={`${styles.alert} ${styles.alertError}`}>
          {errorParam === 'clio_denied' && 'Clio connection was denied or cancelled.'}
          {errorParam === 'clio_failed' && 'Failed to connect to Clio. Please try again.'}
          {errorParam === 'clio_nonce_mismatch' && 'Security validation failed. Please try again.'}
          {!errorParam.startsWith('clio_') && `Connection error: ${errorParam}`}
        </div>
      )}

      <div className={styles.grid}>
        {/* Clio Card */}
        <div className={styles.card}>
          <div className={styles.cardHeader}>
            <h2 className={styles.cardTitle}>Clio</h2>
            <span
              className={`${styles.statusDot} ${clioIntegration ? styles.statusConnected : styles.statusDisconnected}`}
            />
          </div>

          <div className={styles.cardBody}>
            {!clioConfigured ? (
              <p className={styles.notConfigured}>
                Not configured. Set CLIO_CLIENT_ID and CLIO_CLIENT_SECRET environment variables.
              </p>
            ) : clioIntegration ? (
              <>
                <div className={styles.infoRow}>
                  <span className={styles.infoLabel}>Status</span>
                  <span className={styles.infoValue}>Connected</span>
                </div>
                {clioIntegration.connected_at && (
                  <div className={styles.infoRow}>
                    <span className={styles.infoLabel}>Connected</span>
                    <span className={styles.infoValue}>
                      {formatDate(clioIntegration.connected_at)}
                    </span>
                  </div>
                )}
                {clioWebhookDaysLeft !== null && (
                  <div className={styles.infoRow}>
                    <span className={styles.infoLabel}>Webhook expires</span>
                    <span className={styles.infoValue}>
                      {clioWebhookDaysLeft > 0
                        ? `${clioWebhookDaysLeft} days`
                        : 'Expired'}
                    </span>
                  </div>
                )}
                {clioWebhookDaysLeft !== null && clioWebhookDaysLeft <= 3 && (
                  <div className={styles.webhookWarning}>
                    Webhook {clioWebhookDaysLeft <= 0 ? 'has expired' : 'expires soon'}.
                    Reconnect to renew.
                  </div>
                )}
              </>
            ) : (
              <p className={styles.notConfigured}>
                Not connected. Click Connect to link your Clio account.
              </p>
            )}
          </div>

          <IntegrationCards
            provider="clio"
            isConfigured={clioConfigured}
            isConnected={!!clioIntegration}
          />
        </div>

        {/* Amiqus Card */}
        <div className={styles.card}>
          <div className={styles.cardHeader}>
            <h2 className={styles.cardTitle}>Amiqus</h2>
            <span
              className={`${styles.statusDot} ${amiqusIntegration ? styles.statusConnected : styles.statusDisconnected}`}
            />
          </div>

          <div className={styles.cardBody}>
            {!amiqusConfigured ? (
              <p className={styles.notConfigured}>
                Not configured. Set AMIQUS_API_KEY environment variable.
              </p>
            ) : amiqusIntegration ? (
              <>
                <div className={styles.infoRow}>
                  <span className={styles.infoLabel}>Status</span>
                  <span className={styles.infoValue}>Connected</span>
                </div>
                {amiqusIntegration.connected_at && (
                  <div className={styles.infoRow}>
                    <span className={styles.infoLabel}>Connected</span>
                    <span className={styles.infoValue}>
                      {formatDate(amiqusIntegration.connected_at)}
                    </span>
                  </div>
                )}
              </>
            ) : (
              <p className={styles.notConfigured}>
                API key is set but not yet connected. Amiqus uses a Personal Access Token (PAT) for authentication.
              </p>
            )}
          </div>

          <IntegrationCards
            provider="amiqus"
            isConfigured={amiqusConfigured}
            isConnected={!!amiqusIntegration}
          />
        </div>
      </div>
    </>
  );
}
