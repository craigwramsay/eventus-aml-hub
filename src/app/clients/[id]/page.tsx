/**
 * Client Detail Page
 */

import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { getUser } from '@/lib/supabase/server';
import { getClient, getMattersForClient } from '@/app/actions/clients';
import styles from '../clients.module.css';

interface ClientDetailPageProps {
  params: Promise<{ id: string }>;
}

export default async function ClientDetailPage({ params }: ClientDetailPageProps) {
  const user = await getUser();

  if (!user) {
    redirect('/login');
  }

  const { id } = await params;
  const client = await getClient(id);

  if (!client) {
    notFound();
  }

  const matters = await getMattersForClient(id);

  return (
    <div className={styles.container}>
      <Link href="/clients" className={styles.backLink}>
        ← Back to Clients
      </Link>

      <div className={styles.header}>
        <h1 className={styles.title}>{client.name}</h1>
        <span
          className={`${styles.badge} ${
            client.client_type === 'individual'
              ? styles.badgeIndividual
              : styles.badgeCorporate
          }`}
        >
          {client.client_type}
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
            <div className={styles.detailValue}>{client.client_type}</div>
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
                <th>Reference</th>
                <th>Description</th>
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
                      {matter.reference}
                    </Link>
                  </td>
                  <td>{matter.description || '-'}</td>
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
    </div>
  );
}
