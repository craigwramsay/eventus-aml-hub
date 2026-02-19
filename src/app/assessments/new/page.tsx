/**
 * New Assessment Page
 * Loads matter and client, renders CMLRA form, submits via deterministic engine
 */

import Link from 'next/link';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { getMatterForAssessment } from '@/app/actions/assessments';
import { AssessmentForm } from './AssessmentForm';
import styles from './page.module.css';

// Load form configs
import individualFormConfig from '@/config/eventus/forms/CMLRA_individual.json';
import corporateFormConfig from '@/config/eventus/forms/CMLRA_corporate.json';

interface NewAssessmentPageProps {
  searchParams: Promise<{ matter_id?: string }>;
}

export default async function NewAssessmentPage({ searchParams }: NewAssessmentPageProps) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect('/login');
  }

  const { matter_id } = await searchParams;

  if (!matter_id) {
    return (
      <div className={styles.container}>
        <div className={styles.emptyState}>
          <p>No matter specified. Please select a matter to create an assessment.</p>
          <Link href="/matters" className={styles.emptyStateLink}>
            Go to Matters
          </Link>
        </div>
      </div>
    );
  }

  const matter = await getMatterForAssessment(matter_id);

  if (!matter) {
    return (
      <div className={styles.container}>
        <div className={styles.emptyState}>
          <p>Matter not found or you don&apos;t have access to it.</p>
          <Link href="/matters" className={styles.emptyStateLink}>
            Go to Matters
          </Link>
        </div>
      </div>
    );
  }

  // Derive client type from the client
  const derivedClientType = (matter.client.entity_type === 'Individual' ? 'individual' : 'corporate') as 'individual' | 'corporate';

  return (
    <div className={styles.container}>
      <Link href={`/matters/${matter.id}`} className={styles.backLink}>
        ← Back to Matter
      </Link>

      <div className={styles.header}>
        <h1 className={styles.title}>New Risk Assessment</h1>
        <p className={styles.subtitle}>
          Complete the Client and Matter Risk Assessment form below
        </p>
      </div>

      <div className={styles.matterInfo}>
        <div className={styles.matterInfoRow}>
          <span>
            <span className={styles.matterInfoLabel}>Matter: </span>
            <span className={styles.matterInfoValue}>{matter.reference}</span>
          </span>
          <span>
            <span className={styles.matterInfoLabel}>Client: </span>
            <span className={styles.matterInfoValue}>{matter.client.name}</span>
          </span>
          <span>
            <span className={styles.matterInfoLabel}>Type: </span>
            <span className={styles.matterInfoValue}>{derivedClientType}</span>
          </span>
        </div>
      </div>

      <AssessmentForm
        matterId={matter.id}
        derivedClientType={derivedClientType}
        individualFormConfig={individualFormConfig}
        corporateFormConfig={corporateFormConfig}
      />
    </div>
  );
}
