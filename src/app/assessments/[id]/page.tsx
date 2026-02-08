import { getAssessmentWithDetails } from '@/app/actions/assessment';
import type { RiskFactorResult, MandatoryAction } from '@/lib/rules-engine/types';
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

function getRiskBadgeClass(riskLevel: string): string {
  switch (riskLevel) {
    case 'LOW':
      return styles.riskLow;
    case 'MEDIUM':
      return styles.riskMedium;
    case 'HIGH':
      return styles.riskHigh;
    default:
      return '';
  }
}

export default async function AssessmentViewPage({ params }: PageProps) {
  const { id } = await params;
  const result = await getAssessmentWithDetails(id);

  if (!result.success) {
    return (
      <div className={styles.errorContainer}>
        <h1 className={styles.errorTitle}>Assessment Not Found</h1>
        <p className={styles.errorMessage}>{result.error}</p>
        <a href="/" className={styles.backLink}>
          Return to home
        </a>
      </div>
    );
  }

  const { assessment, client, matter, outputSnapshot } = result.data;
  const isFinalised = assessment.finalised_at !== null;

  return (
    <div className={styles.container}>
      <header className={styles.header}>
        <h1 className={styles.title}>Assessment Details</h1>
        <p className={styles.subtitle}>
          Created {formatDate(assessment.created_at)}
        </p>
      </header>

      {isFinalised ? (
        <div className={styles.finalisedBanner}>
          <span className={styles.finalisedIcon}>&#10003;</span>
          <span className={styles.finalisedText}>Assessment Finalised</span>
          <span className={styles.finalisedDate}>
            {formatDate(assessment.finalised_at!)}
          </span>
        </div>
      ) : (
        <div className={styles.draftBanner}>
          <span className={styles.draftText}>Draft - Not yet finalised</span>
        </div>
      )}

      {/* Client & Matter Section */}
      <section className={styles.section}>
        <h2 className={styles.sectionTitle}>Client & Matter</h2>
        <div className={styles.grid}>
          <div className={styles.field}>
            <div className={styles.fieldLabel}>Client Name</div>
            <div className={styles.fieldValue}>{client.name}</div>
          </div>
          <div className={styles.field}>
            <div className={styles.fieldLabel}>Client Type</div>
            <div className={styles.fieldValue}>
              {client.client_type === 'individual' ? 'Individual' : 'Corporate'}
            </div>
          </div>
          <div className={styles.field}>
            <div className={styles.fieldLabel}>Matter Reference</div>
            <div className={styles.fieldValue}>{matter.reference}</div>
          </div>
          <div className={styles.field}>
            <div className={styles.fieldLabel}>Matter Status</div>
            <div className={styles.fieldValue}>{matter.status}</div>
          </div>
          {matter.description && (
            <div className={styles.field}>
              <div className={styles.fieldLabel}>Description</div>
              <div className={styles.fieldValue}>{matter.description}</div>
            </div>
          )}
        </div>
      </section>

      {/* Risk Assessment Section */}
      <section className={styles.section}>
        <h2 className={styles.sectionTitle}>Risk Assessment</h2>
        <div className={styles.grid}>
          <div className={styles.field}>
            <div className={styles.fieldLabel}>Risk Level</div>
            <div className={styles.fieldValue}>
              <span
                className={`${styles.riskBadge} ${getRiskBadgeClass(assessment.risk_level)}`}
              >
                {assessment.risk_level}
              </span>
            </div>
          </div>
          <div className={styles.field}>
            <div className={styles.fieldLabel}>Score</div>
            <div className={styles.score}>{assessment.score}</div>
            <div className={styles.scoreLabel}>
              {assessment.risk_level === 'LOW' && '0-4 = Low Risk'}
              {assessment.risk_level === 'MEDIUM' && '5-8 = Medium Risk'}
              {assessment.risk_level === 'HIGH' && '9+ = High Risk'}
            </div>
          </div>
        </div>

        {outputSnapshot.automaticOutcome && (
          <div className={styles.field} style={{ marginTop: '1rem' }}>
            <div className={styles.fieldLabel}>Automatic Outcome Triggered</div>
            <div className={styles.fieldValue}>
              <strong>{outputSnapshot.automaticOutcome.outcomeId}</strong>
              {' - '}
              {outputSnapshot.automaticOutcome.description}
            </div>
          </div>
        )}
      </section>

      {/* Risk Factors Section */}
      <section className={styles.section}>
        <h2 className={styles.sectionTitle}>
          Triggered Risk Factors ({outputSnapshot.riskFactors.filter((f: RiskFactorResult) => f.score > 0).length})
        </h2>
        {outputSnapshot.riskFactors.filter((f: RiskFactorResult) => f.score > 0).length === 0 ? (
          <p>No risk factors triggered.</p>
        ) : (
          <ul className={styles.factorList}>
            {outputSnapshot.riskFactors
              .filter((factor: RiskFactorResult) => factor.score > 0)
              .map((factor: RiskFactorResult) => (
                <li key={factor.factorId} className={styles.factorItem}>
                  <div className={styles.factorHeader}>
                    <span className={styles.factorLabel}>{factor.factorLabel}</span>
                    <span className={styles.factorScore}>+{factor.score}</span>
                  </div>
                  <div className={styles.factorAnswer}>
                    Answer: {factor.selectedAnswer}
                  </div>
                  {factor.rationale && (
                    <div className={styles.factorRationale}>{factor.rationale}</div>
                  )}
                </li>
              ))}
          </ul>
        )}
      </section>

      {/* Mandatory Actions Section */}
      <section className={styles.section}>
        <h2 className={styles.sectionTitle}>
          Mandatory Actions ({outputSnapshot.mandatoryActions.length})
        </h2>
        {outputSnapshot.mandatoryActions.length === 0 ? (
          <p>No mandatory actions required.</p>
        ) : (
          <ul className={styles.actionList}>
            {outputSnapshot.mandatoryActions.map((action: MandatoryAction, index: number) => (
              <li key={`${action.actionId}-${index}`} className={styles.actionItem}>
                <span className={styles.actionIcon}>&#9679;</span>
                <div className={styles.actionContent}>
                  <div className={styles.actionLabel}>{action.actionName}</div>
                  {action.description && (
                    <div className={styles.actionDescription}>
                      {action.description}
                    </div>
                  )}
                  <div className={styles.actionCategory}>{action.category}</div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* Rationale Section */}
      <section className={styles.section}>
        <h2 className={styles.sectionTitle}>Rationale</h2>
        <ul className={styles.rationaleList}>
          {outputSnapshot.rationale.map((item: string, index: number) => (
            <li key={index} className={styles.rationaleItem}>
              {item}
            </li>
          ))}
        </ul>
      </section>

      {/* Metadata */}
      <div className={styles.metadata}>
        <p>Assessment ID: {assessment.id}</p>
        <p>Assessed at: {outputSnapshot.timestamp}</p>
      </div>
    </div>
  );
}
