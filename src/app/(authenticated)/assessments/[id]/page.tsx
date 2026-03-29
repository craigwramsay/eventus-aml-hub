import Link from 'next/link';
import { getAssessmentWithDetails } from '@/app/actions/assessments';
import { getEvidenceForAssessment, getLatestSowForClient } from '@/app/actions/evidence';
import { getProgressForAssessment } from '@/app/actions/progress';
import { getApprovalForAssessment } from '@/app/actions/approvals';
import { getAmiqusVerifications, getClientLatestAmiqusVerification } from '@/app/actions/amiqus';
import { getClioDriveSyncForAssessment } from '@/app/actions/clio-drive';
import { getUserProfile, createClient } from '@/lib/supabase/server';
import { canFinaliseAssessment, canDeleteEntities } from '@/lib/auth/roles';
import { getCddStalenessConfig } from '@/lib/rules-engine/config-loader';
import { ExportPdfButton } from './ExportPdfButton';
import { FinaliseButton } from './FinaliseButton';
import { DeleteAssessmentButton } from './DeleteAssessmentButton';
import { AssessmentDetail } from './AssessmentDetail';
import { CDDChecklist } from './CDDChecklist';
import { CDDStatusBanner } from './CDDStatusBanner';
import { MonitoringStatement } from './MonitoringStatement';
import type { MandatoryAction, AssessmentWarning } from '@/lib/rules-engine/types';
import type { RiskLevel } from '@/lib/supabase/types';
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
  const [result, evidenceResult, progressResult, approvalResult, amiqusResult, clioDriveSyncRecords] = await Promise.all([
    getAssessmentWithDetails(id),
    getEvidenceForAssessment(id),
    getProgressForAssessment(id),
    getApprovalForAssessment(id),
    getAmiqusVerifications(id),
    getClioDriveSyncForAssessment(id),
  ]);

  if (!result.success) {
    return (
      <div className={styles.errorContainer}>
        <h1 className={styles.errorTitle}>Assessment Not Found</h1>
        <p className={styles.errorMessage}>{result.error}</p>
        <Link href="/assessments" className={styles.navLink}>
          Return to assessments
        </Link>
      </div>
    );
  }

  const { assessment, client, matter, outputSnapshot, registeredNumber } = result.data;
  const evidence = evidenceResult.success ? evidenceResult.evidence : [];
  const progress = progressResult.success ? progressResult.progress : [];
  const userNames = progressResult.success ? progressResult.userNames : {};
  const approval = approvalResult.success ? approvalResult.approval : null;
  const amiqusVerifications = amiqusResult.success ? amiqusResult.verifications : [];
  const amiqusConfigured = !!process.env.AMIQUS_API_KEY;

  // Fetch prior SoW data for pre-population (only if no SoW on this assessment yet)
  const hasSowOnThisAssessment = evidence.some((e) => e.evidence_type === 'sow_declaration');
  const priorSowData = hasSowOnThisAssessment ? null : await getLatestSowForClient(client.id);
  const isFinalised = assessment.finalised_at !== null;
  const isCorporate = client.client_type !== 'individual';

  // Look up client's latest Amiqus verification (for carry-forward identity link)
  const clientAmiqus = amiqusVerifications.some(v => v.status === 'complete')
    ? null  // Already have Amiqus on this assessment, no need for cross-assessment lookup
    : await getClientLatestAmiqusVerification(client.id);

  // Look up names of who created and finalised the assessment
  const supabase = await createClient();
  const userIdsToLookup = [assessment.created_by, assessment.finalised_by].filter(Boolean) as string[];
  let assessmentUserNames: Record<string, string> = {};
  if (userIdsToLookup.length > 0) {
    const { data: profiles } = await supabase
      .from('user_profiles')
      .select('user_id, full_name')
      .in('user_id', userIdsToLookup);
    if (profiles) {
      assessmentUserNames = Object.fromEntries(
        profiles.filter(p => p.full_name).map(p => [p.user_id, p.full_name!])
      );
    }
  }
  const createdByName = assessmentUserNames[assessment.created_by] || null;
  const finalisedByName = assessment.finalised_by ? assessmentUserNames[assessment.finalised_by] || null : null;

  const profile = await getUserProfile();
  const canFinalise = profile ? canFinaliseAssessment(profile.role) : false;
  const canDelete = profile ? canDeleteEntities(profile.role) : false;

  // Compute CDD longstop status — only applies when a previous CDD date exists
  const cddConfig = getCddStalenessConfig();
  const longstopMonths = cddConfig.universalLongstopMonths ?? 24;
  let cddLongstopBreached = false;
  if (client.last_cdd_verified_at) {
    const verifiedAt = new Date(client.last_cdd_verified_at);
    const longstopDate = new Date(verifiedAt);
    longstopDate.setMonth(longstopDate.getMonth() + longstopMonths);
    cddLongstopBreached = new Date() >= longstopDate;
  }

  // Extract matter description from input snapshot for confirm_matter_purpose
  const inputSnapshot = assessment.input_snapshot as { clientType: string; formAnswers: Record<string, string | string[]> };
  const matterDescription = (inputSnapshot.formAnswers?.['23'] || inputSnapshot.formAnswers?.['41'] || '') as string;

  // Separate actions: non-EDD (includes monitoring for acknowledgement), EDD
  const nonEddNonMonitoringActions = outputSnapshot.mandatoryActions.filter(
    (a: MandatoryAction) => a.category !== 'edd'
  );
  const eddActions = outputSnapshot.mandatoryActions.filter(
    (a: MandatoryAction) => a.category === 'edd'
  );
  const hasEddTriggers = outputSnapshot.eddTriggers && outputSnapshot.eddTriggers.length > 0;

  return (
    <>
      {/* 1. Header */}
      <header className={styles.header}>
        <div>
          <h1 className={styles.title}>{client.name}</h1>
          <p className={styles.subtitle}>
            {assessment.reference} &middot; {matter.reference} &middot; {formatDate(assessment.created_at)}
            {' '}&middot;{' '}
            <span className={isFinalised ? styles.statusFinalised : styles.statusDraft}>
              {isFinalised ? 'Finalised' : 'Draft'}
            </span>
          </p>
          <p className={styles.subtitleSecondary}>
            {createdByName && <>Assessment by: <strong>{createdByName}</strong></>}
            {createdByName && finalisedByName && <> &middot; </>}
            {finalisedByName && <>Finalised by: <strong>{finalisedByName}</strong></>}
          </p>
        </div>
      </header>

      {/* CDD Status Banner */}
      <CDDStatusBanner
        lastCddVerifiedAt={client.last_cdd_verified_at ?? null}
        riskLevel={assessment.risk_level as RiskLevel}
      />

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
        approvalStatus={approval ? {
          id: approval.id,
          status: approval.status,
          requested_at: approval.requested_at,
          decision_by_name: approval.decision_by_name,
          decision_at: approval.decision_at,
          decision_notes: approval.decision_notes,
        } : null}
        userRole={profile?.role}
        matterDescription={matterDescription}
        amiqusVerifications={amiqusVerifications}
        amiqusConfigured={amiqusConfigured}
        clientName={client.name}
        clientEmail=""
        lastCddVerifiedAt={client.last_cdd_verified_at ?? null}
        riskLevel={assessment.risk_level}
        priorSowData={priorSowData}
        syncRecords={clioDriveSyncRecords}
        userNames={userNames}
        clientAmiqus={clientAmiqus}
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

      {/* 6. Assessment Detail (collapsible) */}
      <AssessmentDetail
        riskFactors={outputSnapshot.riskFactors}
        rationale={outputSnapshot.rationale}
        assessmentId={assessment.id}
        timestamp={outputSnapshot.timestamp}
      />

      {/* 8. Action buttons */}
      <div className={styles.actionButtons}>
        <ExportPdfButton assessmentId={assessment.id} />
        <Link
          href={`/assessments/${assessment.id}/determination`}
          className={styles.determinationButton}
        >
          View Risk Assessment
        </Link>
        {!isFinalised && canFinalise && (
          <FinaliseButton assessmentId={assessment.id} cddLongstopBreached={cddLongstopBreached} />
        )}
        <Link
          href={`/assessments/new?matter_id=${matter.id}`}
          className={styles.rerunButton}
        >
          Re-run Assessment
        </Link>
      </div>

      {/* 9. Danger Zone (MLRO only) */}
      {canDelete && (
        <section className={styles.dangerSection}>
          <h2 className={styles.sectionTitle}>Danger Zone</h2>
          <DeleteAssessmentButton
            assessmentId={assessment.id}
            isFinalised={isFinalised}
          />
        </section>
      )}
    </>
  );
}
