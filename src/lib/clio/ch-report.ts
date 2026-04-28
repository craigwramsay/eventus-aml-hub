/**
 * Helpers for extracting structured Companies House report data
 * from assessment_evidence rows for use in the assessment PDF.
 */

interface RawCHData {
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
  pscs?: Array<{
    name?: string;
    natures_of_control?: string[];
    nationality?: string;
  }>;
  looked_up_at?: string;
}

export interface CHReport {
  profile: {
    type?: string;
    incorporated?: string;
    address?: string;
    sicCodes?: string[];
    insolvencyHistory?: boolean;
    status?: string;
  };
  officers: Array<{ name: string; role: string }>;
  pscs: Array<{ name: string; nationality?: string; control?: string }>;
  lookedUpAt?: string;
}

function formatCHDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
}

function formatAddress(addr?: NonNullable<RawCHData['profile']>['registered_office_address']): string | undefined {
  if (!addr) return undefined;
  const parts = [addr.address_line_1, addr.address_line_2, addr.locality, addr.region, addr.postal_code].filter(Boolean);
  return parts.length > 0 ? parts.join(', ') : undefined;
}

function humaniseControl(control: string): string {
  const mappings: Record<string, string> = {
    'ownership-of-shares-25-to-50-percent': 'Shares 25\u201350%',
    'ownership-of-shares-50-to-75-percent': 'Shares 50\u201375%',
    'ownership-of-shares-75-to-100-percent': 'Shares 75\u2013100%',
    'voting-rights-25-to-50-percent': 'Voting rights 25\u201350%',
    'voting-rights-50-to-75-percent': 'Voting rights 50\u201375%',
    'voting-rights-75-to-100-percent': 'Voting rights 75\u2013100%',
    'right-to-appoint-and-remove-directors': 'Appoints/removes directors',
    'significant-influence-or-control': 'Significant influence/control',
  };
  return mappings[control] || control.replace(/-/g, ' ');
}

/**
 * Parse a Companies House evidence record (`evidence.data`) into a structured
 * CHReport suitable for rendering in the PDF.
 */
export function parseCHReport(rawData: unknown): CHReport | null {
  if (!rawData || typeof rawData !== 'object') return null;
  const data = rawData as RawCHData;
  if (!data.profile) return null;

  const officers = (data.officers || [])
    .map(o => ({ name: o.name || '', role: o.officer_role || '' }))
    .filter(o => o.name);

  const pscs = (data.pscs || [])
    .map(p => ({
      name: p.name || '',
      nationality: p.nationality || undefined,
      control: p.natures_of_control && p.natures_of_control.length > 0
        ? p.natures_of_control.map(humaniseControl).join('; ')
        : undefined,
    }))
    .filter(p => p.name);

  return {
    profile: {
      type: data.profile.type || undefined,
      incorporated: data.profile.date_of_creation ? formatCHDate(data.profile.date_of_creation) : undefined,
      address: formatAddress(data.profile.registered_office_address),
      sicCodes: data.profile.sic_codes,
      insolvencyHistory: data.profile.has_insolvency_history,
      status: data.profile.company_status,
    },
    officers,
    pscs,
    lookedUpAt: data.looked_up_at ? formatCHDate(data.looked_up_at) : undefined,
  };
}

/**
 * Get just the active director names from a parsed CH report
 * (for items that need to enumerate directors to verify).
 */
export function getDirectorNames(report: CHReport | null): string[] {
  if (!report) return [];
  return report.officers
    .filter(o => /director/i.test(o.role))
    .map(o => o.name);
}

/**
 * Get just the PSC names from a parsed CH report
 * (for items that need to enumerate beneficial owners to verify).
 */
export function getPscNames(report: CHReport | null): string[] {
  if (!report) return [];
  return report.pscs.map(p => p.name);
}
