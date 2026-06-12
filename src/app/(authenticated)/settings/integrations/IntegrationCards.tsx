'use client';

/**
 * Integration Card Actions
 *
 * Client component for Connect/Disconnect/Re-register/Test buttons on the integrations
 * settings page. Renders provider-specific actions for Clio and Amiqus.
 */

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import {
  disconnectIntegration,
  registerAmiqusWebhookForFirm,
  testAmiqusConnection,
  renewClioWebhook,
  testClioConnection,
  backfillClioMatters,
  cleanupOrphanClioWebhooks,
  mergeClioImportedDuplicates,
} from '@/app/actions/integrations';
import type {
  TestAmiqusConnectionResult,
  TestClioConnectionResult,
  BackfillClioMattersResult,
  CleanupClioWebhooksResult,
  MergeClioDuplicatesResult,
} from '@/app/actions/integrations';
import type { IntegrationProvider } from '@/lib/supabase/types';
import styles from './page.module.css';

interface IntegrationCardsProps {
  provider: IntegrationProvider;
  isConfigured: boolean;
  isConnected: boolean;
  hasWebhook?: boolean;
}

export function IntegrationCards({
  provider,
  isConfigured,
  isConnected,
  hasWebhook,
}: IntegrationCardsProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [testRecordId, setTestRecordId] = useState('');
  const [amiqusTestResult, setAmiqusTestResult] = useState<TestAmiqusConnectionResult | null>(null);
  const [clioTestResult, setClioTestResult] = useState<TestClioConnectionResult | null>(null);
  const [backfillSince, setBackfillSince] = useState('');
  const [backfillResult, setBackfillResult] = useState<BackfillClioMattersResult | null>(null);
  const [cleanupResult, setCleanupResult] = useState<CleanupClioWebhooksResult | null>(null);
  const [mergeResult, setMergeResult] = useState<MergeClioDuplicatesResult | null>(null);

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
    setAmiqusTestResult(null);
    const recordId = testRecordId.trim() ? parseInt(testRecordId.trim(), 10) : undefined;
    startTransition(async () => {
      const result = await testAmiqusConnection(recordId);
      if (!result.success) {
        setError(result.error);
      } else {
        setAmiqusTestResult(result.result);
      }
    });
  };

  const handleReregisterClioWebhook = () => {
    setError(null);
    setSuccess(null);
    startTransition(async () => {
      const result = await renewClioWebhook();
      if (!result.success) {
        setError(result.error);
      } else {
        setSuccess('Webhook re-registered successfully.');
        router.refresh();
      }
    });
  };

  const handleTestClioConnection = () => {
    setError(null);
    setSuccess(null);
    setClioTestResult(null);
    startTransition(async () => {
      const result = await testClioConnection();
      if (!result.success) {
        setError(result.error);
      } else {
        setClioTestResult(result.result);
      }
    });
  };

  const handleBackfillClioMatters = () => {
    setError(null);
    setSuccess(null);
    setBackfillResult(null);
    // Convert YYYY-MM-DD input to start-of-day ISO; empty means "use server default" (connected_at)
    const sinceISO = backfillSince.trim()
      ? new Date(`${backfillSince}T00:00:00.000Z`).toISOString()
      : undefined;
    startTransition(async () => {
      const result = await backfillClioMatters(sinceISO);
      if (!result.success) {
        setError(result.error);
      } else {
        setBackfillResult(result.result);
        router.refresh();
      }
    });
  };

  const handleCleanupOrphans = () => {
    setError(null);
    setSuccess(null);
    setCleanupResult(null);
    startTransition(async () => {
      const result = await cleanupOrphanClioWebhooks();
      if (!result.success) {
        setError(result.error);
      } else {
        setCleanupResult(result.result);
      }
    });
  };

  const handlePreviewMerge = () => {
    setError(null);
    setSuccess(null);
    setMergeResult(null);
    startTransition(async () => {
      const result = await mergeClioImportedDuplicates({ dryRun: true });
      if (!result.success) {
        setError(result.error);
      } else {
        setMergeResult(result.result);
      }
    });
  };

  const handleExecuteMerge = () => {
    setError(null);
    setSuccess(null);
    const toMerge = mergeResult?.merged ?? 0;
    if (!toMerge) {
      setError('No pairs ready to merge — run Preview first.');
      return;
    }
    const ok = window.confirm(
      `Merge ${toMerge} duplicate pair${toMerge === 1 ? '' : 's'}? This will:\n` +
        `  • Link the manual records to Clio's IDs\n` +
        `  • Repoint audit events onto the manual records\n` +
        `  • DELETE the Clio-imported duplicates\n\n` +
        `Pairs flagged as ambiguous or having assessments will be skipped.`
    );
    if (!ok) return;
    setMergeResult(null);
    startTransition(async () => {
      const result = await mergeClioImportedDuplicates({ dryRun: false });
      if (!result.success) {
        setError(result.error);
      } else {
        setMergeResult(result.result);
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
          <>
            <button
              type="button"
              className={styles.connectButton}
              onClick={handleReregisterClioWebhook}
              disabled={isPending}
            >
              {isPending
                ? (hasWebhook ? 'Re-registering...' : 'Registering...')
                : (hasWebhook ? 'Re-register Webhook' : 'Register Webhook')}
            </button>
            <button
              type="button"
              className={styles.disconnectButton}
              onClick={handleDisconnect}
              disabled={isPending}
            >
              {isPending ? 'Disconnecting...' : 'Disconnect'}
            </button>
            <div className={styles.connectionTestBlock}>
              <div className={styles.connectionTestRow}>
                <button
                  type="button"
                  className={styles.testConnectionButton}
                  onClick={handleTestClioConnection}
                  disabled={isPending}
                >
                  {isPending ? 'Testing...' : 'Test Connection'}
                </button>
              </div>
              {clioTestResult && <ClioTestResultPanel result={clioTestResult} />}
            </div>
            <div className={styles.connectionTestBlock}>
              <div className={styles.connectionTestRow}>
                <input
                  type="date"
                  className={styles.connectionTestInput}
                  value={backfillSince}
                  onChange={(e) => setBackfillSince(e.target.value)}
                  disabled={isPending}
                  aria-label="Backfill since date"
                />
                <button
                  type="button"
                  className={styles.testConnectionButton}
                  onClick={handleBackfillClioMatters}
                  disabled={isPending}
                  title="Pull any matters created in Clio since the date above (default: Clio connection date). Skips ones already in the Hub."
                >
                  {isPending ? 'Backfilling...' : 'Backfill Matters'}
                </button>
              </div>
              {backfillResult && <BackfillResultPanel result={backfillResult} />}
            </div>
            <div className={styles.connectionTestBlock}>
              <div className={styles.connectionTestRow}>
                <button
                  type="button"
                  className={styles.testConnectionButton}
                  onClick={handleCleanupOrphans}
                  disabled={isPending}
                  title="Delete any Clio webhooks against this firm's account that aren't the one we have stored."
                >
                  {isPending ? 'Cleaning up...' : 'Clean Up Orphan Webhooks'}
                </button>
              </div>
              {cleanupResult && <CleanupResultPanel result={cleanupResult} />}
            </div>
            <div className={styles.connectionTestBlock}>
              <div className={styles.connectionTestRow}>
                <button
                  type="button"
                  className={styles.testConnectionButton}
                  onClick={handlePreviewMerge}
                  disabled={isPending}
                  title="Find clients/matters that exist twice — once manually, once Clio-imported — without making any changes."
                >
                  {isPending ? 'Scanning...' : 'Preview Duplicates'}
                </button>
                <button
                  type="button"
                  className={styles.testConnectionButton}
                  onClick={handleExecuteMerge}
                  disabled={isPending || !mergeResult || mergeResult.merged === 0}
                  title="Merge the duplicate pairs identified in the preview: link manual records to Clio IDs, delete the Clio-imported duplicates."
                >
                  {isPending ? 'Merging...' : 'Merge Duplicates'}
                </button>
              </div>
              {mergeResult && <MergeResultPanel result={mergeResult} />}
            </div>
          </>
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
          <div className={styles.connectionTestBlock}>
            <div className={styles.connectionTestRow}>
              <input
                type="text"
                className={styles.connectionTestInput}
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
            {amiqusTestResult && <AmiqusTestResultPanel result={amiqusTestResult} />}
          </div>
        </>
      )}
    </div>
  );
}

/** Diagnostic result panel — surfaces env var status, auth result, and optional record lookup */
function AmiqusTestResultPanel({ result }: { result: TestAmiqusConnectionResult }) {
  return (
    <div className={styles.connectionTestResult}>
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
            <details className={styles.connectionTestDetails}>
              <summary>Raw case response (first 800 chars)</summary>
              <pre className={styles.connectionTestPre}>{result.recordTest.rawSnippet}</pre>
            </details>
          )}
          {result.recordTest.ok && result.recordTest.clientResponse && (
            <>
              {'keys' in result.recordTest.clientResponse ? (
                <>
                  <Row label="Client top-level keys" ok={true}>
                    <code>{result.recordTest.clientResponse.keys.join(', ') || '(none)'}</code>
                  </Row>
                  <details className={styles.connectionTestDetails}>
                    <summary>Raw client response (first 800 chars)</summary>
                    <pre className={styles.connectionTestPre}>{result.recordTest.clientResponse.rawSnippet}</pre>
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

/**
 * Diagnostic result panel for Clio — reports env vars, stored row state,
 * token refresh, and live API webhook lookup.
 *
 * Each row maps to a likely failure mode: missing env var, missing secret
 * (so HMAC verification rejects every event), expired token, stored webhook
 * no longer present on Clio, or URL mismatch (the receiver host changed).
 */
function ClioTestResultPanel({ result }: { result: TestClioConnectionResult }) {
  const { envVars, integration, tokenTest, webhookListTest } = result;

  return (
    <div className={styles.connectionTestResult}>
      <Row label="Client ID configured" ok={envVars.clientIdConfigured}>
        {envVars.clientIdConfigured ? 'Yes' : 'No — CLIO_CLIENT_ID env var is not set'}
      </Row>
      <Row label="Client secret configured" ok={envVars.clientSecretConfigured}>
        {envVars.clientSecretConfigured ? 'Yes' : 'No — CLIO_CLIENT_SECRET env var is not set'}
      </Row>
      <Row label="App URL configured" ok={envVars.appUrlConfigured}>
        {envVars.appUrlConfigured ? (
          <code>{envVars.appUrl}</code>
        ) : (
          'No — NEXT_PUBLIC_APP_URL env var is not set'
        )}
      </Row>
      <Row label="Integration row exists" ok={integration.exists}>
        {integration.exists ? 'Yes' : 'No — Clio is not connected for this firm'}
      </Row>
      {integration.exists && (
        <>
          <Row label="Webhook ID stored" ok={!!integration.webhookIdStored}>
            {integration.webhookIdStored
              ? <code>{integration.webhookIdStored}</code>
              : 'No — webhook was never registered'}
          </Row>
          <Row label="Webhook secret stored" ok={integration.webhookSecretStored}>
            {integration.webhookSecretStored
              ? 'Yes — incoming events can be signature-verified'
              : 'No — every Clio event will be rejected with 401 (HMAC check needs the shared secret)'}
          </Row>
          <Row
            label="Stored webhook expiry"
            ok={integration.storedWebhookDaysLeft !== null && integration.storedWebhookDaysLeft > 0}
          >
            {integration.storedWebhookExpiresAt
              ? `${integration.storedWebhookExpiresAt} (${integration.storedWebhookDaysLeft! > 0 ? `${integration.storedWebhookDaysLeft} days left` : 'expired'})`
              : 'Not recorded'}
          </Row>
          <Row label="Access token check" ok={tokenTest.ok}>
            {tokenTest.ok
              ? (tokenTest.refreshed ? 'OK — token was refreshed via refresh_token' : 'OK — token still valid')
              : `Failed: ${tokenTest.error}`}
          </Row>
          {webhookListTest && (
            <>
              <Row label="Live webhook list (Clio API)" ok={webhookListTest.ok}>
                {webhookListTest.ok
                  ? `OK — Clio has ${webhookListTest.totalWebhooks} webhook${webhookListTest.totalWebhooks === 1 ? '' : 's'} registered for these credentials`
                  : `Failed${webhookListTest.statusCode ? ` (HTTP ${webhookListTest.statusCode})` : ''}: ${webhookListTest.error}`}
              </Row>
              {webhookListTest.ok && (
                <Row label="Stored webhook present on Clio" ok={webhookListTest.storedWebhookFound}>
                  {webhookListTest.storedWebhookFound
                    ? 'Yes — our stored webhook ID matches one Clio has'
                    : 'No — Clio does not have a webhook with the stored ID. Re-register to fix.'}
                </Row>
              )}
              {webhookListTest.ok && webhookListTest.liveWebhook && (
                <>
                  <Row label="Webhook URL matches expected" ok={webhookListTest.liveWebhook.urlMatchesExpected}>
                    {webhookListTest.liveWebhook.urlMatchesExpected
                      ? <code>{webhookListTest.liveWebhook.url}</code>
                      : <>Mismatch — Clio is calling <code>{webhookListTest.liveWebhook.url}</code> but we expect <code>{webhookListTest.liveWebhook.expectedUrl}</code></>}
                  </Row>
                  <Row label="Webhook events" ok={webhookListTest.liveWebhook.events.includes('created')}>
                    <code>{webhookListTest.liveWebhook.events.join(', ') || '(none)'}</code>
                  </Row>
                  <Row
                    label="Live webhook expiry"
                    ok={webhookListTest.liveWebhook.daysUntilExpiry !== null && webhookListTest.liveWebhook.daysUntilExpiry > 0}
                  >
                    {webhookListTest.liveWebhook.expiresAt
                      ? `${webhookListTest.liveWebhook.expiresAt} (${webhookListTest.liveWebhook.daysUntilExpiry! > 0 ? `${webhookListTest.liveWebhook.daysUntilExpiry} days left` : 'expired'})`
                      : 'Not returned by Clio'}
                  </Row>
                </>
              )}
            </>
          )}
        </>
      )}
    </div>
  );
}

/** Result panel for backfillClioMatters — categorises every Clio matter we found. */
function BackfillResultPanel({ result }: { result: BackfillClioMattersResult }) {
  const sinceShort = result.sinceISO.split('T')[0];
  return (
    <div className={styles.connectionTestResult}>
      <Row label="Backfill window" ok={true}>
        Since <code>{sinceShort}</code>
      </Row>
      <Row label="Matters found in Clio" ok={true}>
        {result.totalFromClio}
        {result.cappedAtMax && ' (capped at 500 — narrow the date range to see more)'}
      </Row>
      <Row label="Imported" ok={true}>
        {result.imported}
      </Row>
      <Row label="Already linked (skipped)" ok={true}>
        {result.alreadyLinked}
      </Row>
      <Row
        label="Likely manual duplicates (NOT imported)"
        ok={result.manualDuplicateCandidates === 0}
      >
        {result.manualDuplicateCandidates}
        {result.manualDuplicateCandidates > 0 && ' — review below and link manually if appropriate'}
      </Row>
      <Row label="Errors" ok={result.errors === 0}>
        {result.errors}
      </Row>
      {result.outcomes.length > 0 && (
        <details className={styles.connectionTestDetails}>
          <summary>Per-matter outcomes ({result.outcomes.length})</summary>
          <div className={styles.connectionTestResult}>
            {result.outcomes.map((o) => (
              <Row
                key={o.clioMatterId}
                label={`${o.displayNumber} — ${o.contactName || '(no contact)'}`}
                ok={o.status === 'imported' || o.status === 'already_linked'}
              >
                {o.status === 'imported' && 'Imported'}
                {o.status === 'already_linked' && 'Already linked'}
                {o.status === 'manual_duplicate_candidate' && (
                  <>
                    Likely manual duplicate of Hub matter{' '}
                    <code>{o.manualMatch?.reference || o.manualMatch?.matterId}</code>
                  </>
                )}
                {o.status === 'error' && <>Error: {o.error}</>}
              </Row>
            ))}
          </div>
        </details>
      )}
    </div>
  );
}

/** Result panel for cleanupOrphanClioWebhooks — shows what we deleted on Clio's side. */
function CleanupResultPanel({ result }: { result: CleanupClioWebhooksResult }) {
  return (
    <div className={styles.connectionTestResult}>
      <Row label="Stored webhook" ok={!!result.storedWebhookId}>
        {result.storedWebhookId ? <code>{result.storedWebhookId}</code> : 'None recorded'}
      </Row>
      <Row label="Total Clio webhooks before cleanup" ok={true}>
        {result.totalWebhooks}
      </Row>
      <Row label="Deleted orphans" ok={result.failed.length === 0}>
        {result.deleted.length === 0
          ? 'None — nothing to clean up'
          : result.deleted.map((id) => <code key={id} style={{ marginRight: '0.5rem' }}>{id}</code>)}
      </Row>
      {result.failed.length > 0 && (
        <Row label="Failed to delete" ok={false}>
          {result.failed.map((f) => (
            <div key={f.id}>
              <code>{f.id}</code>: {f.error}
            </div>
          ))}
        </Row>
      )}
    </div>
  );
}

/** Result panel for mergeClioImportedDuplicates — shows preview or actual merge outcomes. */
function MergeResultPanel({ result }: { result: MergeClioDuplicatesResult }) {
  const headerLabel = result.dryRun ? 'Preview (no changes made)' : 'Merge executed';
  return (
    <div className={styles.connectionTestResult}>
      <Row label="Mode" ok={true}>
        {headerLabel}
      </Row>
      <Row label="Pairs scanned" ok={true}>
        {result.pairsFound}
      </Row>
      <Row label={result.dryRun ? 'Ready to merge' : 'Merged'} ok={true}>
        {result.merged}
      </Row>
      <Row label="Skipped — ambiguous matter count" ok={result.skippedAmbiguous === 0}>
        {result.skippedAmbiguous}
      </Row>
      <Row label="Skipped — already merged" ok={true}>
        {result.skippedAlreadyMerged}
      </Row>
      <Row label="Skipped — assessments on Clio side" ok={result.skippedHasAssessments === 0}>
        {result.skippedHasAssessments}
        {result.skippedHasAssessments > 0 &&
          ' — manual review needed (work was already started on the Clio-imported duplicate)'}
      </Row>
      <Row label="Errors" ok={result.errors === 0}>
        {result.errors}
      </Row>
      {result.outcomes.length > 0 && (
        <details className={styles.connectionTestDetails} open>
          <summary>Per-pair outcomes ({result.outcomes.length})</summary>
          <div className={styles.connectionTestResult}>
            {result.outcomes.map((o, i) => (
              <Row
                key={`${o.manualClientId || ''}-${i}`}
                label={o.clientName}
                ok={o.status === 'merged' || o.status === 'preview_merged' || o.status === 'skipped_already_merged'}
              >
                {o.status === 'preview_merged' && (
                  <>
                    Would link <code>{o.manualMatterReference}</code> → Clio matter{' '}
                    <code>{o.clioMatterId}</code>, then delete imported{' '}
                    <code>{o.clioImportedMatterReference}</code>
                  </>
                )}
                {o.status === 'merged' && (
                  <>
                    Linked <code>{o.manualMatterReference}</code> → Clio matter{' '}
                    <code>{o.clioMatterId}</code>; deleted imported{' '}
                    <code>{o.clioImportedMatterReference}</code>
                  </>
                )}
                {o.status === 'skipped_already_merged' && 'Already linked'}
                {o.status === 'skipped_ambiguous' && <>Ambiguous: {o.reason}</>}
                {o.status === 'skipped_unmatched_clients' && <>{o.reason}</>}
                {o.status === 'skipped_has_assessments' && <>{o.reason}</>}
                {o.status === 'error' && <>Error: {o.reason}</>}
              </Row>
            ))}
          </div>
        </details>
      )}
    </div>
  );
}

function Row({ label, ok, children }: { label: string; ok: boolean; children: React.ReactNode }) {
  return (
    <div className={styles.connectionTestResultRow}>
      <span className={`${styles.connectionTestStatus} ${ok ? styles.connectionTestOk : styles.connectionTestFail}`}>
        {ok ? '✓' : '✗'}
      </span>
      <span className={styles.connectionTestLabel}>{label}</span>
      <span className={styles.connectionTestValue}>{children}</span>
    </div>
  );
}
