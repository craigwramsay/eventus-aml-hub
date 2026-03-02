import { redirect } from 'next/navigation';
import Link from 'next/link';
import { getUserProfile } from '@/lib/supabase/server';
import { isPlatformAdmin } from '@/lib/auth/roles';
import { getAllFirmsConfigStatus } from '@/app/actions/config';

const STATUS_LABELS: Record<string, string> = {
  unconfigured: 'Unconfigured',
  draft: 'Draft',
  active: 'Active',
};

const STATUS_COLORS: Record<string, { bg: string; color: string }> = {
  unconfigured: { bg: '#f3f4f6', color: '#6b7280' },
  draft: { bg: '#fef3c7', color: '#92400e' },
  active: { bg: '#dcfce7', color: '#166534' },
};

export default async function AdminConfigsPage() {
  const profile = await getUserProfile();
  if (!profile || !isPlatformAdmin(profile.role)) {
    redirect('/dashboard');
  }

  const result = await getAllFirmsConfigStatus();
  const firms = result.success ? result.data : [];

  return (
    <>
      <header style={{ marginBottom: 'var(--space-6)' }}>
        <h1 style={{ fontSize: '1.75rem', fontWeight: 600, margin: '0 0 0.25rem 0' }}>
          Firm Configurations
        </h1>
        <p style={{ color: 'var(--text-secondary)', fontSize: '0.875rem', margin: 0 }}>
          View configuration status for all firms on the platform.
        </p>
      </header>

      <div style={{
        background: 'var(--surface)',
        border: '1px solid var(--border)',
        borderRadius: 'var(--radius-xl)',
        padding: 'var(--space-6)',
        boxShadow: 'var(--shadow-sm)',
      }}>
        {firms.length === 0 ? (
          <p style={{ color: 'var(--text-secondary)', fontStyle: 'italic' }}>No firms found.</p>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr>
                {['Firm', 'Config Status', 'Actions'].map((h) => (
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
              {firms.map((firm) => {
                const statusStyle = STATUS_COLORS[firm.config_status] || STATUS_COLORS.unconfigured;
                return (
                  <tr key={firm.id}>
                    <td style={{ padding: 'var(--space-3)', borderBottom: '1px solid var(--border)', fontSize: '0.875rem', fontWeight: 500 }}>
                      {firm.name}
                    </td>
                    <td style={{ padding: 'var(--space-3)', borderBottom: '1px solid var(--border)' }}>
                      <span style={{
                        display: 'inline-flex',
                        padding: '0.125rem 0.5rem',
                        borderRadius: '9999px',
                        fontSize: '0.75rem',
                        fontWeight: 600,
                        textTransform: 'uppercase',
                        letterSpacing: '0.05em',
                        backgroundColor: statusStyle.bg,
                        color: statusStyle.color,
                      }}>
                        {STATUS_LABELS[firm.config_status] || firm.config_status}
                      </span>
                    </td>
                    <td style={{ padding: 'var(--space-3)', borderBottom: '1px solid var(--border)' }}>
                      <Link
                        href={`/admin/configs/${firm.id}`}
                        style={{
                          color: 'var(--accent)',
                          textDecoration: 'none',
                          fontSize: '0.875rem',
                        }}
                      >
                        View Details
                      </Link>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </>
  );
}
