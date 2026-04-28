'use client';

/**
 * Integration Card Actions
 *
 * Client component for Connect/Disconnect buttons on the integrations settings page.
 */

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { disconnectIntegration, registerAmiqusWebhookForFirm, testAmiqusConnection } from '@/app/actions/integrations';
import type { TestAmiqusConnectionResult } from '@/app/actions/integrations';
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
  const [testRecordId, setTestRecordId] = useState('');
  const [testResult, setTestResult] = useState<TestAmiqusConnectionResult | null>(null);

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

  const handleTestAmiqusConnection = () => {
    setError(null);
    setSuccess(null);
    setTestResult(null);
    const recordId = testRecordId.trim() ? parseInt(testRecordId.trim(), 10) : undefined;
    startTransition(async () => {
      const result = await testAmiqusConnection(recordId);
      if (!result.success) {
        setError(result.error);
      } else {
        setTestResult(result.result);
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
          <div className={styles.amiqusTestBlock}>
            <div className={styles.amiqusTestRow}>
              <input
                type="text"
                className={styles.amiqusTestInput}
                placeholder="Optional: record/case ID (e.g. 51331)"
                value={testRecordId}
                onChange={(e) => setTestRecordId(e.target.value)}
                disabled={isPending}
              />
              <button
                type="button"
                className={styles.testConnectionButton}
                onClick={handleTestAmiqusConnection}
                disabled={isPending}
              >
                {isPending ? 'Testing...' : 'Test Connection'}
              </button>
            </div>
            {testResult && <AmiqusTestResultPanel result={testResult} />}
          </div>
        </>
      )}
    </div>
  );
}

/** Diagnostic result panel — surfaces env var status, auth result, and optional record lookup */
function AmiqusTestResultPanel({ result }: { result: TestAmiqusConnectionResult }) {
  return (
    <div className={styles.amiqusTestResult}>
      <Row label="API key configured" ok={result.apiKeyConfigured}>
        {result.apiKeyConfigured ? `Yes (${result.apiKeyTail})` : 'No — AMIQUS_API_KEY env var is not set'}
      </Row>
      <Row label="App URL configured" ok={result.appUrlConfigured}>
        {result.appUrlConfigured ? 'Yes' : 'No — NEXT_PUBLIC_APP_URL env var is not set'}
      </Row>
      <Row label="Authenticated API call" ok={result.authTest.ok}>
        {result.authTest.ok
          ? `OK — fetched ${result.authTest.webhookCount} webhook${result.authTest.webhookCount === 1 ? '' : 's'}`
          : `Failed${result.authTest.statusCode ? ` (HTTP ${result.authTest.statusCode})` : ''}: ${result.authTest.error}`}
      </Row>
      {result.recordTest && (
        <>
          <Row label="Record/case lookup" ok={result.recordTest.ok}>
            {result.recordTest.ok
              ? `OK — found ${result.recordTest.type}, client ID ${result.recordTest.clientId || '(none)'}, name ${result.recordTest.clientName || '(none returned)'}`
              : `Failed${result.recordTest.statusCode ? ` (HTTP ${result.recordTest.statusCode})` : ''}: ${result.recordTest.error}`}
          </Row>
          {result.recordTest.ok && result.recordTest.responseKeys && (
            <Row label="Case top-level keys" ok={true}>
              <code>{result.recordTest.responseKeys.join(', ') || '(none)'}</code>
            </Row>
          )}
          {result.recordTest.ok && result.recordTest.rawSnippet && (
            <details className={styles.amiqusTestDetails}>
              <summary>Raw case response (first 800 chars)</summary>
              <pre className={styles.amiqusTestPre}>{result.recordTest.rawSnippet}</pre>
            </details>
          )}
          {result.recordTest.ok && result.recordTest.clientResponse && (
            <>
              {'keys' in result.recordTest.clientResponse ? (
                <>
                  <Row label="Client top-level keys" ok={true}>
                    <code>{result.recordTest.clientResponse.keys.join(', ') || '(none)'}</code>
                  </Row>
                  <details className={styles.amiqusTestDetails}>
                    <summary>Raw client response (first 800 chars)</summary>
                    <pre className={styles.amiqusTestPre}>{result.recordTest.clientResponse.rawSnippet}</pre>
                  </details>
                </>
              ) : (
                <Row label="Client lookup" ok={false}>
                  Failed{result.recordTest.clientResponse.statusCode ? ` (HTTP ${result.recordTest.clientResponse.statusCode})` : ''}: {result.recordTest.clientResponse.error}
                </Row>
              )}
            </>
          )}
        </>
      )}
    </div>
  );
}

function Row({ label, ok, children }: { label: string; ok: boolean; children: React.ReactNode }) {
  return (
    <div className={styles.amiqusTestResultRow}>
      <span className={`${styles.amiqusTestStatus} ${ok ? styles.amiqusTestOk : styles.amiqusTestFail}`}>
        {ok ? '✓' : '✗'}
      </span>
      <span className={styles.amiqusTestLabel}>{label}</span>
      <span className={styles.amiqusTestValue}>{children}</span>
    </div>
  );
}
