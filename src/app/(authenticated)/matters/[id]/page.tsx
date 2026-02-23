/**
 * Matter Detail Page
 */

import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getMatter, getAssessmentsForMatter } from '@/app/actions/matters';
import { getUserProfile } from '@/lib/supabase/server';
import { canDeleteEntities } from '@/lib/auth/roles';
import { DeleteMatterButton } from './DeleteMatterButton';
import styles from '../matters.module.css';

interface MatterDetailPageProps {
  params: Promise<{ id: string }>;
}

export default async function MatterDetailPage({ params }: MatterDetailPageProps) {
  const { id } = await params;
  const [matter, profile] = await Promise.all([
    getMatter(id),
    getUserProfile(),
  ]);

  if (!matter) {
    notFound();
  }

  const assessments = await getAssessmentsForMatter(id);
  const canDelete = profile ? canDeleteEntities(profile.role) : false;

  return (
    <>
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
              {assessments.map((assessment, index) => (
                <tr key={assessment.id}>
                  <td>
                    <Link
                      href={`/assessments/${assessment.id}`}
                      className={styles.tableLink}
                    >
                      {assessment.id.slice(0, 8)}...
                    </Link>
                    {index === 0 && assessments.length > 1 && (
                      <span className={`${styles.badge} ${styles.badgeOpen}`} style={{ marginLeft: '0.5rem' }}>
                        Latest
                      </span>
                    )}
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

      {canDelete && (
        <section className={styles.dangerSection}>
          <h2 className={styles.sectionTitle}>Danger Zone</h2>
          <DeleteMatterButton
            matterId={matter.id}
            matterReference={matter.reference}
            assessmentCount={assessments.length}
          />
        </section>
      )}
    </>
  );
}
