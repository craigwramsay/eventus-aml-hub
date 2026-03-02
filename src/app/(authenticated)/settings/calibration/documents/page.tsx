import { redirect } from 'next/navigation';
import Link from 'next/link';
import { getUserProfile } from '@/lib/supabase/server';
import { canConfigureFirm } from '@/lib/auth/roles';
import { getFirmDocuments } from '@/app/actions/config';
import { DocumentUpload } from './DocumentUpload';

export default async function DocumentsPage() {
  const profile = await getUserProfile();
  if (!profile || !canConfigureFirm(profile.role)) {
    redirect('/dashboard');
  }

  const result = await getFirmDocuments();
  const documents = result.success ? result.data : [];

  return (
    <>
      <header style={{ marginBottom: 'var(--space-6)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)', marginBottom: 'var(--space-1)' }}>
          <Link
            href="/settings/calibration"
            style={{
              color: 'var(--text-secondary)',
              textDecoration: 'none',
              fontSize: '0.875rem',
            }}
          >
            Firm Config
          </Link>
          <span style={{ color: 'var(--text-secondary)' }}>/</span>
          <span style={{ fontSize: '0.875rem' }}>Documents</span>
        </div>
        <h1 style={{ fontSize: '1.75rem', fontWeight: 600, margin: '0 0 0.25rem 0' }}>
          Firm Documents
        </h1>
        <p style={{ color: 'var(--text-secondary)', fontSize: '0.875rem', margin: 0 }}>
          Upload your PWRA, PCP, AML policy and other reference documents. These are stored for audit trail purposes and are not parsed by the system.
        </p>
      </header>

      <DocumentUpload documents={documents} />
    </>
  );
}
