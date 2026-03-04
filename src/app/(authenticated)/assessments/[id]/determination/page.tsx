/**
 * Risk Assessment Scoring Page
 *
 * Displays only the scoring breakdown from the determination renderer.
 * Route: /assessments/[id]/determination
 */

import Link from 'next/link';
import { getAssessment } from '@/app/actions/assessments';
import { renderDetermination } from '@/lib/determination';
import type { AssessmentRecord, InputSnapshot, OutputSnapshot } from '@/lib/determination';
import { CopyButton } from './CopyButton';
import { PrintButton } from './PrintButton';
import { AutoPrint } from './AutoPrint';
import styles from './page.module.css';

interface PageProps {
  params: Promise<{ id: string }>;
}

export default async function DeterminationPage({ params }: PageProps) {
  const { id } = await params;
  const assessment = await getAssessment(id);

  if (!assessment) {
    return (
      <div className={styles.errorContainer}>
        <h1 className={styles.errorTitle}>Assessment Not Found</h1>
        <p className={styles.errorMessage}>
          The assessment could not be found or you do not have access.
        </p>
        <Link href="/assessments" className={styles.backLink}>
          Return to assessments
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

  // Render the full determination to extract scoring sections
  const determination = renderDetermination(assessmentRecord, {
    ...(jurisdiction ? { jurisdiction } : {}),
  });

  // Extract only: ASSESSMENT DETAILS, RISK DETERMINATION, SCORING BREAKDOWN
  const scoringSections = determination.sections.filter(
    (s) => s.title === 'ASSESSMENT DETAILS' || s.title === 'RISK DETERMINATION' || s.title === 'SCORING BREAKDOWN'
  );

  // Build scoring-only text
  const scoringTextParts: string[] = [];
  scoringTextParts.push('\u2550'.repeat(70));
  scoringTextParts.push('RISK ASSESSMENT SCORING');
  scoringTextParts.push('\u2550'.repeat(70));

  for (const section of scoringSections) {
    scoringTextParts.push('');
    scoringTextParts.push('\u2500'.repeat(70));
    scoringTextParts.push(section.title);
    scoringTextParts.push('\u2500'.repeat(70));
    scoringTextParts.push(section.body);
  }

  scoringTextParts.push('');
  scoringTextParts.push('\u2550'.repeat(70));
  const scoringText = scoringTextParts.join('\n');

  const isFinalised = assessment.finalised_at !== null;

  return (
    <>
      <Link href={`/assessments/${id}`} className={styles.backLink}>
        &larr; Back to Assessment
      </Link>

      <div className={styles.header}>
        <div className={styles.headerLeft}>
          <h1 className={styles.title}>
            Risk Assessment Scoring
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
          <CopyButton text={scoringText} />
          <PrintButton />
        </div>
      </div>

      <pre className={styles.determinationBlock}>
        {scoringText}
      </pre>

      <AutoPrint />
    </>
  );
}
