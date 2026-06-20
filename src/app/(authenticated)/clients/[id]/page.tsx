/**
 * Client Detail Page
 */

import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getClient, getMattersForClient, getClientChildCounts } from '@/app/actions/clients';
import { getUserProfile } from '@/lib/supabase/server';
import { canDeleteEntities, canCreateAssessment } from '@/lib/auth/roles';
import { DeleteClientButton } from './DeleteClientButton';
import { ClientNameEditor } from './ClientNameEditor';
import { ClientClioLinker } from './ClientClioLinker';
import { getClioBaseUrl, buildClioContactUrl } from '@/lib/clio';
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
  // Same permission as delete — MLRO / platform_admin only
  const canRename = canDelete;
  // Solicitor and above — same as creating an assessment
  const canEditDetails = profile ? canCreateAssessment(profile.role) : false;

  return (
    <>
      <div className={styles.header}>
        <ClientNameEditor
          clientId={client.id}
          initialName={client.name}
          canEdit={canRename}
        />
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
        <div className={styles.sectionHeader}>
          <h2 className={styles.sectionTitle} style={{ border: 0, padding: 0, margin: 0 }}>
            Client Details
          </h2>
          {canEditDetails && (
            <Link href={`/clients/${client.id}/edit`} className={styles.secondaryButton}>
              Edit details
            </Link>
          )}
        </div>
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
          <div className={styles.detailField}>
            <div className={styles.detailLabel}>Entity Type</div>
            <div className={styles.detailValue}>{client.entity_type || '—'}</div>
          </div>
          <div className={styles.detailField}>
            <div className={styles.detailLabel}>Sector</div>
            <div className={styles.detailValue}>
              {client.sector && client.sector.toLowerCase() !== 'general'
                ? client.sector
                : '—'}
            </div>
          </div>
          {client.client_type !== 'individual' && (
            <>
              <div className={styles.detailField}>
                <div className={styles.detailLabel}>Company Number</div>
                <div className={styles.detailValue}>
                  {client.registered_number || '—'}
                </div>
              </div>
              <div className={styles.detailField}>
                <div className={styles.detailLabel}>Registered Address</div>
                <div className={styles.detailValue}>
                  {client.registered_address || '—'}
                </div>
              </div>
            </>
          )}
          <div className={styles.detailField}>
            <div className={styles.detailLabel}>Last CDD Verification</div>
            <div className={styles.detailValue}>
              {client.last_cdd_verified_at
                ? new Date(client.last_cdd_verified_at + 'T00:00:00').toLocaleDateString('en-GB', {
                    day: 'numeric',
                    month: 'long',
                    year: 'numeric',
                  })
                : 'Not recorded'}
            </div>
          </div>
          <div className={styles.detailField}>
            <div className={styles.detailLabel}>Clio Link</div>
            <div className={styles.detailValue}>
              <ClientClioLinker
                clientId={client.id}
                clientName={client.name}
                clioContactId={client.clio_contact_id ?? null}
                clioContactUrl={
                  client.clio_contact_id
                    ? buildClioContactUrl(getClioBaseUrl(), client.clio_contact_id)
                    : null
                }
                canEdit={canRename}
              />
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
