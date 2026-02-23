'use client';

/**
 * Companies House Lookup Card
 *
 * Displays a CH lookup result as an expandable card showing
 * company name, status, directors, and lookup date.
 */

import { useState } from 'react';
import type { AssessmentEvidence } from '@/lib/supabase/types';
import styles from './page.module.css';

interface CompaniesHouseCardProps {
  evidence: AssessmentEvidence;
}

interface CHData {
  profile?: {
    company_name?: string;
    company_number?: string;
    company_status?: string;
    type?: string;
    date_of_creation?: string;
    registered_office_address?: {
      address_line_1?: string;
      address_line_2?: string;
      locality?: string;
      region?: string;
      postal_code?: string;
    };
    sic_codes?: string[];
    has_insolvency_history?: boolean;
  };
  officers?: Array<{
    name?: string;
    officer_role?: string;
    appointed_on?: string;
  }>;
  looked_up_at?: string;
}

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
}

function formatAddress(addr?: NonNullable<CHData['profile']>['registered_office_address']): string {
  if (!addr) return 'Not available';
  return [addr.address_line_1, addr.address_line_2, addr.locality, addr.region, addr.postal_code]
    .filter(Boolean)
    .join(', ');
}

export function CompaniesHouseCard({ evidence }: CompaniesHouseCardProps) {
  const [expanded, setExpanded] = useState(false);
  const data = evidence.data as unknown as CHData | null;

  if (!data?.profile) {
    return (
      <div className={styles.evidenceCard}>
        <div className={styles.evidenceCardHeader}>
          <span className={styles.evidenceBadgeCH}>Companies House</span>
          <span className={styles.evidenceLabel}>{evidence.label}</span>
        </div>
      </div>
    );
  }

  const { profile, officers } = data;
  const statusClass =
    profile.company_status === 'active' ? styles.chStatusActive : styles.chStatusOther;

  return (
    <div className={styles.evidenceCard}>
      <button
        type="button"
        className={styles.evidenceCardHeader}
        onClick={() => setExpanded(!expanded)}
        aria-expanded={expanded}
      >
        <span className={styles.evidenceBadgeCH}>Companies House</span>
        <span className={styles.evidenceLabel}>
          {profile.company_name} ({profile.company_number})
        </span>
        <span className={`${styles.chStatus} ${statusClass}`}>
          {profile.company_status}
        </span>
        <span className={styles.expandIcon}>{expanded ? '\u25B2' : '\u25BC'}</span>
      </button>

      {expanded && (
        <div className={styles.evidenceCardBody}>
          <div className={styles.chGrid}>
            <div className={styles.chField}>
              <span className={styles.chFieldLabel}>Company Type</span>
              <span>{profile.type || 'N/A'}</span>
            </div>
            <div className={styles.chField}>
              <span className={styles.chFieldLabel}>Incorporated</span>
              <span>{profile.date_of_creation ? formatDate(profile.date_of_creation) : 'N/A'}</span>
            </div>
            <div className={styles.chField}>
              <span className={styles.chFieldLabel}>Registered Office</span>
              <span>{formatAddress(profile.registered_office_address)}</span>
            </div>
            {profile.sic_codes && profile.sic_codes.length > 0 && (
              <div className={styles.chField}>
                <span className={styles.chFieldLabel}>SIC Codes</span>
                <span>{profile.sic_codes.join(', ')}</span>
              </div>
            )}
            {profile.has_insolvency_history && (
              <div className={styles.chField}>
                <span className={styles.chFieldLabel}>Insolvency History</span>
                <span className={styles.chWarning}>Yes</span>
              </div>
            )}
          </div>

          {officers && officers.length > 0 && (
            <div className={styles.chOfficers}>
              <h4 className={styles.chOfficersTitle}>
                Active Officers ({officers.length})
              </h4>
              <ul className={styles.chOfficerList}>
                {officers.map((officer, idx) => (
                  <li key={idx} className={styles.chOfficerItem}>
                    <span className={styles.chOfficerName}>{officer.name}</span>
                    <span className={styles.chOfficerRole}>{officer.officer_role}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          <div className={styles.chLookupDate}>
            Looked up: {data.looked_up_at ? formatDate(data.looked_up_at) : formatDate(evidence.created_at)}
          </div>
        </div>
      )}
    </div>
  );
}
