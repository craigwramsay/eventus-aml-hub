import { redirect } from 'next/navigation';
import { getUserProfile } from '@/lib/supabase/server';
import { isPlatformAdmin } from '@/lib/auth/roles';
import { getActiveBaseline } from '@/app/actions/config';
import type { RegulatoryBaseline } from '@/lib/rules-engine/baseline-types';

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
}

export default async function BaselineManagementPage() {
  const profile = await getUserProfile();
  if (!profile || !isPlatformAdmin(profile.role)) {
    redirect('/dashboard');
  }

  const result = await getActiveBaseline();
  const baselineRow = result.success ? result.data : null;

  // Parse baseline rules or fall back to static file
  let baseline: RegulatoryBaseline | null = null;
  if (baselineRow?.baseline_rules) {
    baseline = baselineRow.baseline_rules as unknown as RegulatoryBaseline;
  } else {
    try {
      const staticBaseline = await import('@/config/platform/regulatory_baseline_v1.json');
      baseline = staticBaseline.default as unknown as RegulatoryBaseline;
    } catch {
      // No baseline available
    }
  }

  return (
    <>
      <header style={{ marginBottom: 'var(--space-6)' }}>
        <h1 style={{ fontSize: '1.75rem', fontWeight: 600, margin: '0 0 0.25rem 0' }}>
          Regulatory Baseline
        </h1>
        <p style={{ color: 'var(--text-secondary)', fontSize: '0.875rem', margin: 0 }}>
          Platform-managed regulatory floor that all firm configurations are validated against.
        </p>
      </header>

      {!baseline ? (
        <div style={{
          background: 'var(--surface)',
          border: '1px solid var(--border)',
          borderRadius: 'var(--radius-xl)',
          padding: 'var(--space-6)',
        }}>
          <p style={{ color: 'var(--text-secondary)', fontStyle: 'italic' }}>
            No regulatory baseline loaded.
          </p>
        </div>
      ) : (
        <>
          {/* Baseline Meta */}
          <div style={{
            background: 'var(--surface)',
            border: '1px solid var(--border)',
            borderRadius: 'var(--radius-xl)',
            padding: 'var(--space-6)',
            boxShadow: 'var(--shadow-sm)',
            marginBottom: 'var(--space-6)',
          }}>
            <h2 style={{ fontSize: '1.125rem', fontWeight: 600, margin: '0 0 var(--space-4) 0' }}>
              Overview
            </h2>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 'var(--space-4)' }}>
              <div>
                <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', textTransform: 'uppercase', marginBottom: '0.25rem' }}>Version</div>
                <div style={{ fontWeight: 500 }}>{baseline.version}</div>
              </div>
              <div>
                <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', textTransform: 'uppercase', marginBottom: '0.25rem' }}>Effective Date</div>
                <div style={{ fontWeight: 500 }}>{formatDate(baseline.effectiveDate)}</div>
              </div>
              <div>
                <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', textTransform: 'uppercase', marginBottom: '0.25rem' }}>Authorities</div>
                <div style={{ fontWeight: 500 }}>{baseline.authorities.join(', ')}</div>
              </div>
              {baselineRow && (
                <div>
                  <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', textTransform: 'uppercase', marginBottom: '0.25rem' }}>DB Version</div>
                  <div style={{ fontWeight: 500 }}>v{baselineRow.version_number}</div>
                </div>
              )}
            </div>
          </div>

          {/* Mandatory Scoring Factors */}
          <div style={{
            background: 'var(--surface)',
            border: '1px solid var(--border)',
            borderRadius: 'var(--radius-xl)',
            padding: 'var(--space-6)',
            boxShadow: 'var(--shadow-sm)',
            marginBottom: 'var(--space-6)',
          }}>
            <h2 style={{ fontSize: '1.125rem', fontWeight: 600, margin: '0 0 var(--space-4) 0' }}>
              Mandatory Scoring Factors
            </h2>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr>
                  {['Factor', 'Description', 'Authority'].map((h) => (
                    <th key={h} style={{
                      textAlign: 'left',
                      fontSize: '0.75rem',
                      fontWeight: 600,
                      color: 'var(--text-secondary)',
                      textTransform: 'uppercase',
                      padding: 'var(--space-2) var(--space-3)',
                      borderBottom: '2px solid var(--border)',
                    }}>
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {baseline.scoring.mandatoryFactors.map((f) => (
                  <tr key={f.factorId}>
                    <td style={{ padding: 'var(--space-3)', borderBottom: '1px solid var(--border)', fontSize: '0.875rem', fontWeight: 500 }}>
                      {f.factorId}
                    </td>
                    <td style={{ padding: 'var(--space-3)', borderBottom: '1px solid var(--border)', fontSize: '0.875rem' }}>
                      {f.description}
                    </td>
                    <td style={{ padding: 'var(--space-3)', borderBottom: '1px solid var(--border)', fontSize: '0.8125rem', color: 'var(--text-secondary)', fontStyle: 'italic' }}>
                      {f.authority}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Mandatory CDD Actions */}
          <div style={{
            background: 'var(--surface)',
            border: '1px solid var(--border)',
            borderRadius: 'var(--radius-xl)',
            padding: 'var(--space-6)',
            boxShadow: 'var(--shadow-sm)',
            marginBottom: 'var(--space-6)',
          }}>
            <h2 style={{ fontSize: '1.125rem', fontWeight: 600, margin: '0 0 var(--space-4) 0' }}>
              Mandatory CDD Actions
            </h2>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr>
                  {['Action', 'Description', 'Client Types', 'Risk Levels', 'Authority'].map((h) => (
                    <th key={h} style={{
                      textAlign: 'left',
                      fontSize: '0.75rem',
                      fontWeight: 600,
                      color: 'var(--text-secondary)',
                      textTransform: 'uppercase',
                      padding: 'var(--space-2) var(--space-3)',
                      borderBottom: '2px solid var(--border)',
                    }}>
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {baseline.cdd.mandatoryActions.map((a) => (
                  <tr key={a.actionId}>
                    <td style={{ padding: 'var(--space-3)', borderBottom: '1px solid var(--border)', fontSize: '0.875rem', fontWeight: 500 }}>
                      {a.actionId}
                    </td>
                    <td style={{ padding: 'var(--space-3)', borderBottom: '1px solid var(--border)', fontSize: '0.875rem' }}>
                      {a.description}
                    </td>
                    <td style={{ padding: 'var(--space-3)', borderBottom: '1px solid var(--border)', fontSize: '0.8125rem' }}>
                      {a.appliesTo.clientTypes.join(', ')}
                    </td>
                    <td style={{ padding: 'var(--space-3)', borderBottom: '1px solid var(--border)', fontSize: '0.8125rem' }}>
                      {a.appliesTo.riskLevels.join(', ')}
                    </td>
                    <td style={{ padding: 'var(--space-3)', borderBottom: '1px solid var(--border)', fontSize: '0.8125rem', color: 'var(--text-secondary)', fontStyle: 'italic' }}>
                      {a.authority}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Staleness Thresholds */}
          <div style={{
            background: 'var(--surface)',
            border: '1px solid var(--border)',
            borderRadius: 'var(--radius-xl)',
            padding: 'var(--space-6)',
            boxShadow: 'var(--shadow-sm)',
          }}>
            <h2 style={{ fontSize: '1.125rem', fontWeight: 600, margin: '0 0 var(--space-4) 0' }}>
              CDD Staleness Maximums
            </h2>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 'var(--space-4)' }}>
              {(['HIGH', 'MEDIUM', 'LOW'] as const).map((level) => (
                <div key={level} style={{
                  textAlign: 'center',
                  padding: 'var(--space-4)',
                  borderRadius: 'var(--radius-md)',
                  backgroundColor: 'var(--surface-hover)',
                }}>
                  <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', textTransform: 'uppercase', marginBottom: '0.25rem' }}>
                    {level} Risk
                  </div>
                  <div style={{ fontSize: '1.5rem', fontWeight: 700 }}>
                    {baseline.staleness.maxMonths[level]}
                  </div>
                  <div style={{ fontSize: '0.8125rem', color: 'var(--text-secondary)' }}>months max</div>
                </div>
              ))}
            </div>
          </div>
        </>
      )}
    </>
  );
}
