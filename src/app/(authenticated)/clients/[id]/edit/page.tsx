import { notFound, redirect } from 'next/navigation';
import Link from 'next/link';
import { getClient } from '@/app/actions/clients';
import { getUserProfile } from '@/lib/supabase/server';
import { canCreateAssessment } from '@/lib/auth/roles';
import { EditClientForm } from './EditClientForm';
import styles from '../../clients.module.css';

interface EditClientPageProps {
  params: Promise<{ id: string }>;
}

export default async function EditClientPage({ params }: EditClientPageProps) {
  const { id } = await params;
  const [client, profile] = await Promise.all([getClient(id), getUserProfile()]);
  if (!client) notFound();
  if (!profile || !canCreateAssessment(profile.role)) redirect(`/clients/${id}`);

  return (
    <>
      <div className={styles.header}>
        <div>
          <h1 className={styles.title}>Edit details — {client.name}</h1>
          <p className={styles.subtitle}>
            Fill in the fields the assessment form needs.{' '}
            <Link href={`/clients/${client.id}`} className={styles.tableLink}>
              Back to client
            </Link>
          </p>
        </div>
      </div>

      <div className={styles.section}>
        <EditClientForm client={client} />
      </div>
    </>
  );
}
