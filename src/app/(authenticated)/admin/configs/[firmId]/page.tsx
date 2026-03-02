import { redirect } from 'next/navigation';
import Link from 'next/link';
import { getUserProfile } from '@/lib/supabase/server';
import { isPlatformAdmin } from '@/lib/auth/roles';
import { getFirmConfigDetail } from '@/app/actions/config';
import type { FirmConfigVersion, FirmConfigGapAcknowledgement } from '@/lib/supabase/types';

interface PageProps {
  params: Promise<{ firmId: string }>;
}

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
}

const STATUS_COLORS: Record<string, { bg: string; color: string }> = {
  draft: { bg: '#fef3c7', color: '#92400e' },
  active: { bg: '#dcfce7', color: '#166534' },
  superseded: { bg: '#f3f4f6', color: '#6b7280' },
};

export default async function FirmConfigDetailPage({ params }: PageProps) {
  const profile = await getUserProfile();
  if (!profile || !isPlatformAdmin(profile.role)) {
    redirect('/dashboard');
  }

  const { firmId } = await params;
  const result = await getFirmConfigDetail(firmId);

  if (!result.success) {
    return (
      <div>
        <p>Error loading firm config: {result.error}</p>
        <Link href="/admin/configs">Back to firms</Link>
      </div>
    );
  }

  const { versions, acknowledgements } = result.data;

  // Group acknowledgements by config version
  const acksByVersion = new Map<string, FirmConfigGapAcknowledgement[]>();
  for (const ack of acknowledgements) {
    const existing = acksByVersion.get(ack.config_version_id) || [];
    existing.push(ack);
    acksByVersion.set(ack.config_version_id, existing);
  }

  return (
    <>
      <header style={{ marginBottom: 'var(--space-6)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)', marginBottom: 'var(--space-1)' }}>
          <Link href="/admin/configs" style={{ color: 'var(--text-secondary)', textDecoration: 'none', fontSize: '0.875rem' }}>
            Firm Configurations
          </Link>
          <span style={{ color: 'var(--text-secondary)' }}>/</span>
          <span style={{ fontSize: '0.875rem' }}>Detail</span>
        </div>
        <h1 style={{ fontSize: '1.75rem', fontWeight: 600, margin: '0 0 0.25rem 0' }}>
          Firm Config History
        </h1>
      </header>

      {/* Version History */}
      <div style={{
        background: 'var(--surface)',
        border: '1px solid var(--border)',
        borderRadius: 'var(--radius-xl)',
        padding: 'var(--space-6)',
        boxShadow: 'var(--shadow-sm)',
        marginBottom: 'var(--space-6)',
      }}>
        <h2 style={{ fontSize: '1.125rem', fontWeight: 600, margin: '0 0 var(--space-4) 0' }}>
          Config Versions
        </h2>

        {versions.length === 0 ? (
          <p style={{ color: 'var(--text-secondary)', fontStyle: 'italic' }}>No config versions.</p>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr>
                {['Version', 'Status', 'Created', 'Activated', 'Gaps', 'Summary'].map((h) => (
                  <th key={h} style={{
                    textAlign: 'left',
                    fontSize: '0.75rem',
                    fontWeight: 600,
                    color: 'var(--text-secondary)',
                    textTransform: 'uppercase',
                    letterSpacing: '0.05em',
                    padding: 'var(--space-2) var(--space-3)',
                    borderBottom: '2px solid var(--border)',
                  }}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {versions.map((version: FirmConfigVersion) => {
                const statusStyle = STATUS_COLORS[version.status] || STATUS_COLORS.superseded;
                const versionAcks = acksByVersion.get(version.id) || [];
                return (
                  <tr key={version.id}>
                    <td style={{ padding: 'var(--space-3)', borderBottom: '1px solid var(--border)', fontSize: '0.875rem' }}>
                      v{version.version_number}
                    </td>
                    <td style={{ padding: 'var(--space-3)', borderBottom: '1px solid var(--border)' }}>
                      <span style={{
                        display: 'inline-flex',
                        padding: '0.125rem 0.5rem',
                        borderRadius: '9999px',
                        fontSize: '0.75rem',
                        fontWeight: 600,
                        textTransform: 'uppercase',
                        backgroundColor: statusStyle.bg,
                        color: statusStyle.color,
                      }}>
                        {version.status}
                      </span>
                    </td>
                    <td style={{ padding: 'var(--space-3)', borderBottom: '1px solid var(--border)', fontSize: '0.875rem' }}>
                      {formatDate(version.created_at)}
                    </td>
                    <td style={{ padding: 'var(--space-3)', borderBottom: '1px solid var(--border)', fontSize: '0.875rem' }}>
                      {version.activated_at ? formatDate(version.activated_at) : '-'}
                    </td>
                    <td style={{ padding: 'var(--space-3)', borderBottom: '1px solid var(--border)', fontSize: '0.875rem' }}>
                      {versionAcks.length > 0 ? `${versionAcks.length} acknowledged` : '-'}
                    </td>
                    <td style={{ padding: 'var(--space-3)', borderBottom: '1px solid var(--border)', fontSize: '0.875rem' }}>
                      {version.change_summary || '-'}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      {/* Gap Acknowledgements */}
      {acknowledgements.length > 0 && (
        <div style={{
          background: 'var(--surface)',
          border: '1px solid var(--border)',
          borderRadius: 'var(--radius-xl)',
          padding: 'var(--space-6)',
          boxShadow: 'var(--shadow-sm)',
        }}>
          <h2 style={{ fontSize: '1.125rem', fontWeight: 600, margin: '0 0 var(--space-4) 0' }}>
            Gap Acknowledgements
          </h2>

          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr>
                {['Gap', 'Baseline Requirement', 'Firm Value', 'Rationale', 'Acknowledged'].map((h) => (
                  <th key={h} style={{
                    textAlign: 'left',
                    fontSize: '0.75rem',
                    fontWeight: 600,
                    color: 'var(--text-secondary)',
                    textTransform: 'uppercase',
                    letterSpacing: '0.05em',
                    padding: 'var(--space-2) var(--space-3)',
                    borderBottom: '2px solid var(--border)',
                  }}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {acknowledgements.map((ack: FirmConfigGapAcknowledgement) => (
                <tr key={ack.id}>
                  <td style={{ padding: 'var(--space-3)', borderBottom: '1px solid var(--border)', fontSize: '0.875rem' }}>
                    <div style={{ fontWeight: 500 }}>{ack.gap_code}</div>
                    <div style={{ fontSize: '0.8125rem', color: 'var(--text-secondary)' }}>{ack.gap_description}</div>
                  </td>
                  <td style={{ padding: 'var(--space-3)', borderBottom: '1px solid var(--border)', fontSize: '0.8125rem' }}>
                    {ack.baseline_requirement}
                  </td>
                  <td style={{ padding: 'var(--space-3)', borderBottom: '1px solid var(--border)', fontSize: '0.8125rem' }}>
                    {ack.firm_value || '-'}
                  </td>
                  <td style={{ padding: 'var(--space-3)', borderBottom: '1px solid var(--border)', fontSize: '0.8125rem' }}>
                    {ack.rationale}
                  </td>
                  <td style={{ padding: 'var(--space-3)', borderBottom: '1px solid var(--border)', fontSize: '0.8125rem' }}>
                    {formatDate(ack.acknowledged_at)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
