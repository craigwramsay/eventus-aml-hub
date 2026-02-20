import Link from 'next/link';
import { getAssessmentWithDetails } from '@/app/actions/assessments';
import { getEvidenceForAssessment } from '@/app/actions/evidence';
import { getProgressForAssessment } from '@/app/actions/progress';
import { getUserProfile } from '@/lib/supabase/server';
import { canFinaliseAssessment } from '@/lib/auth/roles';
import { FinaliseButton } from './FinaliseButton';
import { EvidenceSection } from './EvidenceSection';
import { AssessmentDetail } from './AssessmentDetail';
import { CDDChecklist } from './CDDChecklist';
import { MonitoringStatement } from './MonitoringStatement';
import type { MandatoryAction, AssessmentWarning } from '@/lib/rules-engine/types';
import styles from './page.module.css';

interface PageProps {
  params: Promise<{ id: string }>;
}

function formatDate(dateString: string): string {
  return new Date(dateString).toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

/** Convert risk level to title case display */
function riskLevelDisplay(level: string): string {
  switch (level) {
    case 'LOW': return 'Low Risk';
    case 'MEDIUM': return 'Medium Risk';
    case 'HIGH': return 'High Risk';
    default: return level;
  }
}

function getRiskHeroClass(riskLevel: string): string {
  switch (riskLevel) {
    case 'LOW': return styles.riskHeroLow;
    case 'MEDIUM': return styles.riskHeroMedium;
    case 'HIGH': return styles.riskHeroHigh;
    default: return '';
  }
}

export default async function AssessmentViewPage({ params }: PageProps) {
  const { id } = await params;
  const [result, evidenceResult, progressResult] = await Promise.all([
    getAssessmentWithDetails(id),
    getEvidenceForAssessment(id),
    getProgressForAssessment(id),
  ]);

  if (!result.success) {
    return (
      <div className={styles.errorContainer}>
        <h1 className={styles.errorTitle}>Assessment Not Found</h1>
        <p className={styles.errorMessage}>{result.error}</p>
        <Link href="/" className={styles.backLink}>
          Return to home
        </Link>
      </div>
    );
  }

  const { assessment, client, matter, outputSnapshot, registeredNumber } = result.data;
  const evidence = evidenceResult.success ? evidenceResult.evidence : [];
  const progress = progressResult.success ? progressResult.progress : [];
  const isFinalised = assessment.finalised_at !== null;
  const isCorporate = client.client_type !== 'individual';
  const profile = await getUserProfile();
  const canFinalise = profile ? canFinaliseAssessment(profile.role) : false;

  // Separate actions: non-EDD (excluding monitoring), EDD, and monitoring
  const nonEddNonMonitoringActions = outputSnapshot.mandatoryActions.filter(
    (a: MandatoryAction) => a.category !== 'edd' && a.category !== 'monitoring'
  );
  const eddActions = outputSnapshot.mandatoryActions.filter(
    (a: MandatoryAction) => a.category === 'edd'
  );
  const hasEddTriggers = outputSnapshot.eddTriggers && outputSnapshot.eddTriggers.length > 0;

  return (
    <div className={styles.container}>
      {/* Nav links */}
      <nav className={styles.navRow}>
        <Link href="/assessments" className={styles.navLink}>
          &larr; Back to Dashboard
        </Link>
        <Link href={`/assessments?matter=${matter.id}`} className={styles.navLink}>
          Back to Matter
        </Link>
      </nav>

      {/* 1. Header */}
      <header className={styles.header}>
        <div>
          <h1 className={styles.title}>{client.name}</h1>
          <p className={styles.subtitle}>
            {matter.reference} &middot; {formatDate(assessment.created_at)}
            {' '}&middot;{' '}
            <span className={isFinalised ? styles.statusFinalised : styles.statusDraft}>
              {isFinalised ? 'Finalised' : 'Draft'}
            </span>
          </p>
        </div>
      </header>

      {/* 2. Risk Level Hero */}
      <section className={`${styles.riskHero} ${getRiskHeroClass(assessment.risk_level)}`}>
        <div className={styles.riskHeroContent}>
          <h2 className={styles.riskHeroLevel}>{riskLevelDisplay(assessment.risk_level)}</h2>
          <div className={styles.riskHeroScore}>
            Score: {assessment.score}
            <span className={styles.riskHeroThreshold}>
              {assessment.risk_level === 'LOW' && '(0\u20134 = Low)'}
              {assessment.risk_level === 'MEDIUM' && '(5\u20138 = Medium)'}
              {assessment.risk_level === 'HIGH' && '(9+ = High)'}
            </span>
          </div>
          {outputSnapshot.automaticOutcome && (
            <div className={styles.riskHeroOutcome}>
              {outputSnapshot.automaticOutcome.description}
            </div>
          )}
          {hasEddTriggers && (
            <div className={styles.riskHeroEdd}>
              Enhanced Due Diligence is required (see below).
            </div>
          )}
        </div>
      </section>

      {/* 3. Interactive CDD Checklist + EDD section */}
      <CDDChecklist
        assessmentId={assessment.id}
        actions={nonEddNonMonitoringActions}
        eddActions={eddActions}
        eddTriggers={outputSnapshot.eddTriggers || []}
        evidence={evidence}
        progress={progress}
        isCorporate={isCorporate}
        registeredNumber={registeredNumber}
        isFinalised={isFinalised}
      />

      {/* 4. Monitoring Statement */}
      <MonitoringStatement
        isHighRisk={assessment.risk_level === 'HIGH'}
        hasEddTriggers={hasEddTriggers ?? false}
      />

      {/* 5. Warnings (conditional) */}
      {outputSnapshot.warnings && outputSnapshot.warnings.length > 0 && (
        <section className={`${styles.section} ${styles.warningSection}`}>
          <h2 className={styles.sectionTitle}>Warnings</h2>
          <ul className={styles.warningList}>
            {outputSnapshot.warnings.map((warning: AssessmentWarning) => (
              <li key={warning.warningId} className={styles.warningItem}>
                <strong>MLRO ESCALATION REQUIRED:</strong> {warning.message}
                <div className={styles.warningAuthority}>{warning.authority}</div>
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* 6. General Evidence */}
      <EvidenceSection
        assessmentId={assessment.id}
        evidence={evidence}
        registeredNumber={registeredNumber}
        isCorporate={isCorporate}
        isFinalised={isFinalised}
      />

      {/* 7. Assessment Detail (collapsible) */}
      <AssessmentDetail
        riskFactors={outputSnapshot.riskFactors}
        rationale={outputSnapshot.rationale}
        assessmentId={assessment.id}
        timestamp={outputSnapshot.timestamp}
      />

      {/* 8. Action buttons */}
      <div className={styles.actionButtons}>
        <Link
          href={`/assessments/${assessment.id}/determination`}
          className={styles.determinationButton}
        >
          View Determination
        </Link>
        {!isFinalised && canFinalise && <FinaliseButton assessmentId={assessment.id} />}
      </div>
    </div>
  );
}
