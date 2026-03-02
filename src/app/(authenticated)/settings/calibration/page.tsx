import { redirect } from 'next/navigation';
import Link from 'next/link';
import { getUserProfile } from '@/lib/supabase/server';
import { canConfigureFirm } from '@/lib/auth/roles';
import { getConfigVersionHistory, getActiveConfig, getDraftConfig } from '@/app/actions/config';
import type { FirmConfigVersion } from '@/lib/supabase/types';
import styles from './page.module.css';

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
}

function statusBadgeClass(status: string): string {
  switch (status) {
    case 'active':
      return styles.statusActive;
    case 'draft':
      return styles.statusDraft;
    default:
      return styles.statusUnconfigured;
  }
}

export default async function CalibrationOverviewPage() {
  const profile = await getUserProfile();
  if (!profile || !canConfigureFirm(profile.role)) {
    redirect('/dashboard');
  }

  const [activeResult, draftResult, historyResult] = await Promise.all([
    getActiveConfig(),
    getDraftConfig(),
    getConfigVersionHistory(),
  ]);

  const activeConfig = activeResult.success ? activeResult.data : null;
  const draftConfig = draftResult.success ? draftResult.data : null;
  const versions = historyResult.success ? historyResult.data : [];

  const configStatus = draftConfig ? 'draft' : activeConfig ? 'active' : 'unconfigured';

  return (
    <>
      <header className={styles.header}>
        <h1 className={styles.title}>Firm Configuration</h1>
        <p className={styles.subtitle}>
          Calibrate your firm&apos;s risk assessment settings, CDD requirements, and sector mappings.
        </p>
      </header>

      <div className={styles.statusCard}>
        <div className={styles.statusHeader}>
          <h2 className={styles.statusTitle}>Configuration Status</h2>
          <span className={`${styles.statusBadge} ${statusBadgeClass(configStatus)}`}>
            {configStatus}
          </span>
        </div>

        {configStatus === 'unconfigured' && (
          <p className={styles.statusInfo}>
            Your firm has not yet configured its risk assessment settings. New assessments will use
            platform defaults until you complete the calibration wizard.
          </p>
        )}

        {configStatus === 'draft' && (
          <p className={styles.statusInfo}>
            You have an in-progress calibration draft (v{draftConfig?.version_number}).
            Continue the wizard to complete and activate it.
          </p>
        )}

        {configStatus === 'active' && activeConfig && (
          <p className={styles.statusInfo}>
            Active configuration: Version {activeConfig.version_number}
            {activeConfig.activated_at && ` (activated ${formatDate(activeConfig.activated_at)})`}.
            All new assessments use this configuration.
          </p>
        )}

        <div className={styles.statusActions}>
          {configStatus === 'unconfigured' && (
            <Link href="/settings/calibration/wizard" className={styles.primaryButton}>
              Start Calibration Wizard
            </Link>
          )}

          {configStatus === 'draft' && (
            <Link href="/settings/calibration/wizard" className={styles.primaryButton}>
              Continue Wizard
            </Link>
          )}

          {configStatus === 'active' && (
            <Link href="/settings/calibration/wizard" className={styles.primaryButton}>
              Create New Version
            </Link>
          )}

          <Link href="/settings/calibration/documents" className={styles.secondaryButton}>
            Manage Documents
          </Link>
        </div>
      </div>

      <div className={styles.historyCard}>
        <h2 className={styles.historyTitle}>Version History</h2>

        {versions.length === 0 ? (
          <p className={styles.emptyHistory}>No configuration versions yet.</p>
        ) : (
          <table className={styles.historyTable}>
            <thead>
              <tr>
                <th>Version</th>
                <th>Status</th>
                <th>Created</th>
                <th>Activated</th>
                <th>Summary</th>
              </tr>
            </thead>
            <tbody>
              {versions.map((version: FirmConfigVersion) => (
                <tr key={version.id}>
                  <td>v{version.version_number}</td>
                  <td>
                    <span className={`${styles.statusBadge} ${statusBadgeClass(version.status)}`}>
                      {version.status}
                    </span>
                  </td>
                  <td>{formatDate(version.created_at)}</td>
                  <td>{version.activated_at ? formatDate(version.activated_at) : '-'}</td>
                  <td>{version.change_summary || '-'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </>
  );
}
