/**
 * Determination Page
 *
 * Displays the formal risk determination document for an assessment.
 * Route: /assessments/[id]/determination
 */

import Link from 'next/link';
import { getAssessment } from '@/app/actions/assessments';
import { getEvidenceForAssessment } from '@/app/actions/evidence';
import { renderDetermination } from '@/lib/determination';
import type { AssessmentRecord, InputSnapshot, OutputSnapshot, EvidenceForDetermination } from '@/lib/determination';
import { CopyButton } from './CopyButton';
import { PrintButton } from './PrintButton';
import styles from './page.module.css';

interface PageProps {
  params: Promise<{ id: string }>;
}

export default async function DeterminationPage({ params }: PageProps) {
  const { id } = await params;
  const [assessment, evidenceResult] = await Promise.all([
    getAssessment(id),
    getEvidenceForAssessment(id),
  ]);

  if (!assessment) {
    return (
      <div className={styles.errorContainer}>
        <h1 className={styles.errorTitle}>Assessment Not Found</h1>
        <p className={styles.errorMessage}>
          The assessment could not be found or you do not have access.
        </p>
        <Link href="/" className={styles.backLink}>
          Return to home
        </Link>
      </div>
    );
  }

  // Build assessment record for renderer
  const assessmentRecord: AssessmentRecord = {
    id: assessment.id,
    matter_id: assessment.matter_id,
    input_snapshot: assessment.input_snapshot as unknown as InputSnapshot,
    output_snapshot: assessment.output_snapshot as unknown as OutputSnapshot,
    risk_level: assessment.risk_level,
    score: assessment.score,
    created_at: assessment.created_at,
    finalised_at: assessment.finalised_at,
  };

  // Read jurisdiction from snapshot (stored at assessment creation time)
  const jurisdiction = assessmentRecord.input_snapshot.jurisdiction;

  // Build evidence for determination
  const evidence: EvidenceForDetermination[] = evidenceResult.success
    ? evidenceResult.evidence.map((e) => ({
        evidence_type: e.evidence_type,
        label: e.label,
        source: e.source,
        data: e.data,
        created_at: e.created_at,
      }))
    : [];

  // Render the determination (jurisdiction from snapshot, or options override)
  const determination = renderDetermination(assessmentRecord, {
    ...(jurisdiction ? { jurisdiction } : {}),
    ...(evidence.length > 0 ? { evidence } : {}),
  });

  const isFinalised = assessment.finalised_at !== null;

  return (
    <div className={styles.container}>
      <a href={`/assessments/${id}`} className={styles.backLink}>
        &larr; Back to Assessment
      </a>

      <div className={styles.header}>
        <div className={styles.headerLeft}>
          <h1 className={styles.title}>
            Risk Determination
            <span
              className={`${styles.statusBadge} ${isFinalised ? styles.statusFinalised : styles.statusDraft}`}
            >
              {isFinalised ? 'Finalised' : 'Draft'}
            </span>
          </h1>
          <p className={styles.subtitle}>
            Assessment ID: {assessment.id}
          </p>
        </div>
        <div className={styles.headerButtons}>
          <CopyButton text={determination.determinationText} />
          <PrintButton />
        </div>
      </div>

      <pre className={styles.determinationBlock}>
        {determination.determinationText}
      </pre>
    </div>
  );
}
