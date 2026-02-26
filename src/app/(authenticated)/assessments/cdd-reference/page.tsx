/**
 * CDD Reference Page
 *
 * Temporary reference page showing all CDD actions by client type and risk level.
 * Calls getMandatoryActions() for 12 combinations and displays them read-only.
 */

import Link from 'next/link';
import { getMandatoryActions } from '@/lib/rules-engine/requirements';
import { getCDDRulesetConfig } from '@/lib/rules-engine/config-loader';
import type { ClientType, RiskLevel, MandatoryAction, EDDTriggerResult } from '@/lib/rules-engine/types';
import styles from './page.module.css';

interface Scenario {
  id: string;
  label: string;
  clientType: ClientType;
  riskLevel: RiskLevel;
  formAnswers?: Record<string, string | string[]>;
  eddTriggers?: EDDTriggerResult[];
}

const SCENARIOS: Scenario[] = [
  {
    id: 'individual-low-new',
    label: 'Individual — LOW (new client)',
    clientType: 'individual',
    riskLevel: 'LOW',
    formAnswers: { '3': 'New client' },
  },
  {
    id: 'individual-low-existing',
    label: 'Individual — LOW (existing client)',
    clientType: 'individual',
    riskLevel: 'LOW',
    formAnswers: { '3': 'Existing client' },
  },
  {
    id: 'individual-medium',
    label: 'Individual — MEDIUM',
    clientType: 'individual',
    riskLevel: 'MEDIUM',
  },
  {
    id: 'individual-high',
    label: 'Individual — HIGH',
    clientType: 'individual',
    riskLevel: 'HIGH',
  },
  {
    id: 'corporate-low-new',
    label: 'UK Private Limited Company — LOW (new client)',
    clientType: 'corporate',
    riskLevel: 'LOW',
    formAnswers: { '10': 'UK private limited company', '16': 'New client' },
  },
  {
    id: 'corporate-medium',
    label: 'UK Private Limited Company — MEDIUM',
    clientType: 'corporate',
    riskLevel: 'MEDIUM',
    formAnswers: { '10': 'UK private limited company' },
  },
  {
    id: 'corporate-high',
    label: 'UK Private Limited Company — HIGH',
    clientType: 'corporate',
    riskLevel: 'HIGH',
    formAnswers: { '10': 'UK private limited company' },
  },
  {
    id: 'llp-low-new',
    label: 'UK LLP / Partnership — LOW (new client)',
    clientType: 'corporate',
    riskLevel: 'LOW',
    formAnswers: { '10': 'LLP', '16': 'New client' },
  },
  {
    id: 'llp-medium',
    label: 'UK LLP / Partnership — MEDIUM',
    clientType: 'corporate',
    riskLevel: 'MEDIUM',
    formAnswers: { '10': 'LLP' },
  },
  {
    id: 'llp-high',
    label: 'UK LLP / Partnership — HIGH',
    clientType: 'corporate',
    riskLevel: 'HIGH',
    formAnswers: { '10': 'LLP' },
  },
  {
    id: 'individual-low-edd-tcsp',
    label: 'Individual — LOW + EDD trigger (TCSP)',
    clientType: 'individual',
    riskLevel: 'LOW',
    eddTriggers: [
      {
        triggerId: 'tcsp_activity',
        description: 'Matter involves Trust or Company Service Provider (TCSP) activity',
        authority: 'Eventus AML PCPs, §20; MLR 2017, reg. 33(1)(a)',
        triggeredBy: 'TCSP activity',
      },
    ],
  },
  {
    id: 'corporate-medium-edd-tcsp',
    label: 'UK Private Limited Company — MEDIUM + EDD trigger (TCSP)',
    clientType: 'corporate',
    riskLevel: 'MEDIUM',
    formAnswers: { '10': 'UK private limited company' },
    eddTriggers: [
      {
        triggerId: 'tcsp_activity',
        description: 'Matter involves Trust or Company Service Provider (TCSP) activity',
        authority: 'Eventus AML PCPs, §20; MLR 2017, reg. 33(1)(a)',
        triggeredBy: 'TCSP activity',
      },
    ],
  },
];

const CATEGORY_LABELS: Record<string, string> = {
  cdd: 'CDD',
  edd: 'EDD',
  sow: 'SoW',
  sof: 'SoF',
  monitoring: 'Monitoring',
  escalation: 'Escalation',
};

function ActionCard({ action, num }: { action: MandatoryAction; num: number }) {
  return (
    <div className={styles.actionCard}>
      <span className={styles.actionNumber}>{num}.</span>
      <div className={styles.actionBody}>
        <div className={styles.actionText}>
          {action.displayText || action.description}
        </div>
        <div className={styles.actionBadges}>
          <span className={styles.categoryBadge}>
            {CATEGORY_LABELS[action.category] || action.category}
          </span>
          <span className={action.priority === 'required' ? styles.priorityRequired : styles.priorityRecommended}>
            {action.priority}
          </span>
        </div>
      </div>
    </div>
  );
}

export default function CDDReferencePage() {
  const config = getCDDRulesetConfig();

  const sections = SCENARIOS.map((scenario) => {
    const result = getMandatoryActions(
      scenario.clientType,
      scenario.riskLevel,
      config,
      scenario.formAnswers,
      scenario.eddTriggers
    );
    return {
      ...scenario,
      actions: result.actions,
      warnings: result.warnings,
    };
  });

  return (
    <div className={styles.container}>
      <header className={styles.header}>
        <h1 className={styles.title}>CDD Requirements Reference</h1>
        <p className={styles.subtitle}>
          All CDD/EDD actions by client type and risk level, as generated by the rules engine.
          This page is for internal review.
        </p>
      </header>

      <nav className={styles.toc}>
        <h2 className={styles.tocTitle}>Contents</h2>
        <ol className={styles.tocList}>
          {sections.map((s, i) => (
            <li key={s.id}>
              <a href={`#${s.id}`} className={styles.tocLink}>
                {i + 1}. {s.label} ({s.actions.length} actions)
              </a>
            </li>
          ))}
        </ol>
      </nav>

      {sections.map((section, sectionIdx) => (
        <section key={section.id} id={section.id} className={styles.section}>
          <h2 className={styles.sectionTitle}>
            {sectionIdx + 1}. {section.label}
          </h2>
          <p className={styles.sectionMeta}>
            {section.actions.length} actions
            {section.eddTriggers && section.eddTriggers.length > 0 &&
              ` · EDD trigger: ${section.eddTriggers.map(t => t.description).join(', ')}`
            }
          </p>
          {section.actions.map((action, idx) => (
            <ActionCard key={action.actionId} action={action} num={idx + 1} />
          ))}
        </section>
      ))}

      <Link href="/assessments" className={styles.backLink}>
        Back to Assessments
      </Link>
    </div>
  );
}
