/**
 * Matter Detail Page
 */

import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { getMatter, getAssessmentsForMatter } from '@/app/actions/matters';
import styles from '../matters.module.css';

interface MatterDetailPageProps {
  params: Promise<{ id: string }>;
}

export default async function MatterDetailPage({ params }: MatterDetailPageProps) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect('/login');
  }

  const { id } = await params;
  const matter = await getMatter(id);

  if (!matter) {
    notFound();
  }

  const assessments = await getAssessmentsForMatter(id);

  return (
    <div className={styles.container}>
      <Link href="/matters" className={styles.backLink}>
        ← Back to Matters
      </Link>

      <div className={styles.header}>
        <h1 className={styles.title}>{matter.reference}</h1>
        <span
          className={`${styles.badge} ${
            matter.status === 'open' ? styles.badgeOpen : styles.badgeClosed
          }`}
        >
          {matter.status}
        </span>
      </div>

      <div className={styles.section}>
        <h2 className={styles.sectionTitle}>Matter Details</h2>
        <div className={styles.detailGrid}>
          <div className={styles.detailField}>
            <div className={styles.detailLabel}>Matter ID</div>
            <div className={styles.detailValue}>{matter.id}</div>
          </div>
          <div className={styles.detailField}>
            <div className={styles.detailLabel}>Reference</div>
            <div className={styles.detailValue}>{matter.reference}</div>
          </div>
          <div className={styles.detailField}>
            <div className={styles.detailLabel}>Client</div>
            <div className={styles.detailValue}>
              <Link
                href={`/clients/${matter.client.id}`}
                className={styles.tableLink}
              >
                {matter.client.name}
              </Link>
            </div>
          </div>
          <div className={styles.detailField}>
            <div className={styles.detailLabel}>Client Type</div>
            <div className={styles.detailValue}>{matter.client.client_type}</div>
          </div>
          <div className={styles.detailField}>
            <div className={styles.detailLabel}>Status</div>
            <div className={styles.detailValue}>{matter.status}</div>
          </div>
          <div className={styles.detailField}>
            <div className={styles.detailLabel}>Created</div>
            <div className={styles.detailValue}>
              {new Date(matter.created_at).toLocaleString()}
            </div>
          </div>
          {matter.description && (
            <div className={styles.detailField} style={{ gridColumn: '1 / -1' }}>
              <div className={styles.detailLabel}>Description</div>
              <div className={styles.detailValue}>{matter.description}</div>
            </div>
          )}
        </div>
      </div>

      <div className={styles.section}>
        <div className={styles.sectionHeader}>
          <h2>Assessments</h2>
          <Link
            href={`/assessments/new?matter_id=${matter.id}`}
            className={styles.primaryButton}
          >
            New Assessment
          </Link>
        </div>

        {assessments.length === 0 ? (
          <div className={styles.emptyState}>
            <p>No assessments for this matter yet.</p>
          </div>
        ) : (
          <table className={styles.table}>
            <thead>
              <tr>
                <th>ID</th>
                <th>Risk Level</th>
                <th>Score</th>
                <th>Status</th>
                <th>Created</th>
              </tr>
            </thead>
            <tbody>
              {assessments.map((assessment) => (
                <tr key={assessment.id}>
                  <td>
                    <Link
                      href={`/assessments/${assessment.id}`}
                      className={styles.tableLink}
                    >
                      {assessment.id.slice(0, 8)}...
                    </Link>
                  </td>
                  <td>
                    <span
                      className={`${styles.badge} ${
                        assessment.risk_level === 'LOW'
                          ? styles.badgeLow
                          : assessment.risk_level === 'MEDIUM'
                          ? styles.badgeMedium
                          : styles.badgeHigh
                      }`}
                    >
                      {assessment.risk_level}
                    </span>
                  </td>
                  <td>{assessment.score}</td>
                  <td>
                    <span
                      className={`${styles.badge} ${
                        assessment.finalised_at
                          ? styles.badgeFinalised
                          : styles.badgeOpen
                      }`}
                    >
                      {assessment.finalised_at ? 'Finalised' : 'Draft'}
                    </span>
                  </td>
                  <td>
                    {new Date(assessment.created_at).toLocaleDateString()}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
