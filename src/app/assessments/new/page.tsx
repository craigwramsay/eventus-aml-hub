/**
 * New Assessment Page
 * Loads matter and client, renders CMLRA form, submits via deterministic engine
 */

import Link from 'next/link';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { getMatterForAssessment, getAssessmentsForMatter } from '@/app/actions/assessments';
import { AssessmentForm } from './AssessmentForm';
import type { FormAnswers } from '@/lib/rules-engine/types';
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
  const clientTypeLabel = derivedClientType === 'individual' ? 'Individual' : 'Non-individual';

  // Build matter display: prefer description, fall back to reference
  const matterDisplay = matter.description || matter.reference;

  // Check for existing assessments on this client to determine new/existing status
  const existingAssessments = await getAssessmentsForMatter(matter_id);
  const isExistingClient = existingAssessments.length > 0;

  // Build initial values from client/matter data
  // Field IDs differ between individual and corporate forms
  const initialValues: FormAnswers = {};
  const readOnlyFields: string[] = [];

  if (derivedClientType === 'corporate') {
    // Corporate form field mappings
    if (matter.client.name) {
      initialValues['3'] = matter.client.name;
      readOnlyFields.push('3');
    }
    if (matter.client.registered_number) {
      initialValues['4'] = matter.client.registered_number;
      readOnlyFields.push('4');
    }
    if (matter.client.registered_address) {
      initialValues['6'] = matter.client.registered_address;
      readOnlyFields.push('6');
    }
    if (matter.client.trading_address) {
      initialValues['8'] = matter.client.trading_address;
      readOnlyFields.push('8');
    }
    if (matter.client.entity_type) {
      initialValues['10'] = matter.client.entity_type;
      readOnlyFields.push('10');
    }
    if (matter.client.sector) {
      initialValues['12'] = matter.client.sector;
      readOnlyFields.push('12');
    }
    initialValues['16'] = isExistingClient ? 'Existing client' : 'New client';
    readOnlyFields.push('16');
    if (matter.description) {
      initialValues['41'] = matter.description;
      readOnlyFields.push('41');
    }
    if (matter.client.aml_regulated !== undefined && matter.client.aml_regulated !== null) {
      initialValues['51'] = matter.client.aml_regulated ? 'Yes' : 'No';
      readOnlyFields.push('51');
    }
  } else {
    // Individual form field mappings
    if (matter.client.name) {
      initialValues['8'] = matter.client.name;
      readOnlyFields.push('8');
    }
    initialValues['3'] = isExistingClient ? 'Existing client' : 'New client';
    readOnlyFields.push('3');
    if (matter.description) {
      initialValues['23'] = matter.description;
      readOnlyFields.push('23');
    }
  }

  return (
    <div className={styles.container}>
      <Link href={`/matters/${matter.id}`} className={styles.backLink}>
        &larr; Back to Matter
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
            <span className={styles.matterInfoValue}>{matterDisplay}</span>
            {matter.description && matter.reference && (
              <span className={styles.matterInfoRef}> ({matter.reference})</span>
            )}
          </span>
          <span>
            <span className={styles.matterInfoLabel}>Client: </span>
            <span className={styles.matterInfoValue}>{matter.client.name}</span>
          </span>
          <span>
            <span className={styles.matterInfoLabel}>Type: </span>
            <span className={styles.matterInfoValue}>{clientTypeLabel}</span>
          </span>
        </div>
      </div>

      <AssessmentForm
        matterId={matter.id}
        derivedClientType={derivedClientType}
        entityType={matter.client.entity_type}
        individualFormConfig={individualFormConfig}
        corporateFormConfig={corporateFormConfig}
        initialValues={initialValues}
        readOnlyFields={readOnlyFields}
      />
    </div>
  );
}
