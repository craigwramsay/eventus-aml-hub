/**
 * Jurisdiction Configuration
 *
 * Maps jurisdiction codes to regulator details and regulatory references.
 * MLR 2017 is UK-wide; LSAG is cross-jurisdictional.
 * Differences are primarily in the regulator and specific statutory provisions.
 */

import type { Jurisdiction } from '@/lib/supabase/types';

export interface JurisdictionConfig {
  regulator: string;
  pocaPart: string;
  jurisdictionLabel: string;
}

export const JURISDICTION_CONFIG: Record<Jurisdiction, JurisdictionConfig> = {
  scotland: {
    regulator: 'Law Society of Scotland',
    pocaPart: 'Part 3',
    jurisdictionLabel: 'Scotland',
  },
  england_and_wales: {
    regulator: 'Solicitors Regulation Authority (SRA)',
    pocaPart: 'Part 7',
    jurisdictionLabel: 'England & Wales',
  },
};

export function getJurisdictionConfig(jurisdiction: Jurisdiction): JurisdictionConfig {
  return JURISDICTION_CONFIG[jurisdiction];
}
