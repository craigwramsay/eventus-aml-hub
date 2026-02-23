/**
 * Client Detail Page
 */

import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getClient, getMattersForClient, getClientChildCounts } from '@/app/actions/clients';
import { getUserProfile } from '@/lib/supabase/server';
import { canDeleteEntities } from '@/lib/auth/roles';
import { DeleteClientButton } from './DeleteClientButton';
import styles from '../clients.module.css';

interface ClientDetailPageProps {
  params: Promise<{ id: string }>;
}

export default async function ClientDetailPage({ params }: ClientDetailPageProps) {
  const { id } = await params;
  const [client, profile] = await Promise.all([
    getClient(id),
    getUserProfile(),
  ]);

  if (!client) {
    notFound();
  }

  const [matters, childCounts] = await Promise.all([
    getMattersForClient(id),
    getClientChildCounts(id),
  ]);

  const canDelete = profile ? canDeleteEntities(profile.role) : false;

  return (
    <>
      <div className={styles.header}>
        <h1 className={styles.title}>{client.name}</h1>
        <span
          className={`${styles.badge} ${
            client.client_type === 'individual'
              ? styles.badgeIndividual
              : styles.badgeCorporate
          }`}
        >
          {client.client_type.charAt(0).toUpperCase() + client.client_type.slice(1)}
        </span>
      </div>

      <div className={styles.section}>
        <h2 className={styles.sectionTitle}>Client Details</h2>
        <div className={styles.detailGrid}>
          <div className={styles.detailField}>
            <div className={styles.detailLabel}>Client ID</div>
            <div className={styles.detailValue}>{client.id}</div>
          </div>
          <div className={styles.detailField}>
            <div className={styles.detailLabel}>Client Type</div>
            <div className={styles.detailValue}>{client.client_type.charAt(0).toUpperCase() + client.client_type.slice(1)}</div>
          </div>
          <div className={styles.detailField}>
            <div className={styles.detailLabel}>Created</div>
            <div className={styles.detailValue}>
              {new Date(client.created_at).toLocaleString()}
            </div>
          </div>
          <div className={styles.detailField}>
            <div className={styles.detailLabel}>Updated</div>
            <div className={styles.detailValue}>
              {new Date(client.updated_at).toLocaleString()}
            </div>
          </div>
        </div>
      </div>

      <div className={styles.section}>
        <div className={styles.sectionHeader}>
          <h2>Matters</h2>
          <Link
            href={`/matters/new?client_id=${client.id}`}
            className={styles.primaryButton}
          >
            New Matter
          </Link>
        </div>

        {matters.length === 0 ? (
          <div className={styles.emptyState}>
            <p>No matters for this client yet.</p>
          </div>
        ) : (
          <table className={styles.table}>
            <thead>
              <tr>
                <th>Description</th>
                <th>Reference</th>
                <th>Status</th>
                <th>Created</th>
              </tr>
            </thead>
            <tbody>
              {matters.map((matter) => (
                <tr key={matter.id}>
                  <td>
                    <Link
                      href={`/matters/${matter.id}`}
                      className={styles.tableLink}
                    >
                      {matter.description || matter.reference}
                    </Link>
                  </td>
                  <td>
                    <Link
                      href={`/matters/${matter.id}`}
                      className={styles.tableLink}
                    >
                      {matter.reference}
                    </Link>
                  </td>
                  <td>
                    <span className={styles.badge}>
                      {matter.status}
                    </span>
                  </td>
                  <td>
                    {new Date(matter.created_at).toLocaleDateString()}
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
          <DeleteClientButton
            clientId={client.id}
            clientName={client.name}
            matterCount={childCounts.matterCount}
            assessmentCount={childCounts.assessmentCount}
          />
        </section>
      )}
    </>
  );
}
