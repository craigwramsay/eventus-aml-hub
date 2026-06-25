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

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export interface CompaniesHouseHtmlParams {
  /** Company name as captured at lookup (used for the title and filename). */
  companyName: string;
  /** Company number, displayed in the header strip. */
  companyNumber?: string;
  /** Surrounding assessment context — included for traceability in Clio. */
  clientName: string;
  matterReference: string;
  assessmentReference: string;
  /** Parsed report payload. */
  report: CHReport;
}

/**
 * Render a Companies House search result as a self-contained HTML document
 * for upload to Clio Drive. Matches the SoW/SoF declaration look so the
 * compliance folder reads as a coherent set.
 */
export function generateCompaniesHouseHtml(params: CompaniesHouseHtmlParams): string {
  const { companyName, companyNumber, clientName, matterReference, assessmentReference, report } = params;

  const generatedAt = new Date().toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });

  const profileRow = (label: string, value: string | undefined) =>
    value
      ? `<tr><td style="padding:6px 12px;font-weight:600;width:200px;border-bottom:1px solid #eee;font-size:13px;color:#333;vertical-align:top;">${escapeHtml(label)}</td><td style="padding:6px 12px;border-bottom:1px solid #eee;font-size:13px;color:#444;vertical-align:top;">${escapeHtml(value)}</td></tr>`
      : '';

  const sicCodes = report.profile.sicCodes && report.profile.sicCodes.length > 0
    ? report.profile.sicCodes.join(', ')
    : undefined;

  const officersHtml = report.officers.length > 0
    ? report.officers
        .map(o => `<tr><td style="padding:6px 12px;border-bottom:1px solid #eee;font-size:13px;color:#444;">${escapeHtml(o.name)}</td><td style="padding:6px 12px;border-bottom:1px solid #eee;font-size:13px;color:#666;">${escapeHtml(o.role || '—')}</td></tr>`)
        .join('')
    : '<tr><td colspan="2" style="padding:8px 12px;font-size:13px;color:#999;font-style:italic;">No officers returned.</td></tr>';

  const pscsHtml = report.pscs.length > 0
    ? report.pscs
        .map(p => `<tr><td style="padding:6px 12px;border-bottom:1px solid #eee;font-size:13px;color:#444;">${escapeHtml(p.name)}</td><td style="padding:6px 12px;border-bottom:1px solid #eee;font-size:13px;color:#666;">${escapeHtml(p.control || '—')}</td><td style="padding:6px 12px;border-bottom:1px solid #eee;font-size:13px;color:#666;">${escapeHtml(p.nationality || '—')}</td></tr>`)
        .join('')
    : '<tr><td colspan="3" style="padding:8px 12px;font-size:13px;color:#999;font-style:italic;">No PSCs returned.</td></tr>';

  const headerSubtitle = companyNumber
    ? `${companyName} — ${companyNumber}`
    : companyName;

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Companies House Report - ${escapeHtml(companyName)} (${escapeHtml(assessmentReference)})</title>
</head>
<body style="margin:0;padding:0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;background:#f5f5f5;">
  <div style="max-width:760px;margin:32px auto;background:#fff;border-radius:8px;box-shadow:0 2px 8px rgba(0,0,0,0.1);overflow:hidden;">

    <!-- Header -->
    <div style="padding:24px 32px;background:#1a1a2e;color:#fff;">
      <h1 style="margin:0 0 4px;font-size:20px;font-weight:600;">Companies House Report</h1>
      <p style="margin:0;font-size:14px;opacity:0.85;">${escapeHtml(headerSubtitle)}</p>
    </div>

    <!-- Assessment context -->
    <div style="padding:20px 32px;border-bottom:1px solid #eee;">
      <table style="width:100%;font-size:13px;color:#444;border-collapse:collapse;">
        <tr><td style="padding:4px 0;font-weight:600;width:160px;">Client</td><td style="padding:4px 0;">${escapeHtml(clientName)}</td></tr>
        <tr><td style="padding:4px 0;font-weight:600;">Assessment Ref</td><td style="padding:4px 0;">${escapeHtml(assessmentReference)}</td></tr>
        <tr><td style="padding:4px 0;font-weight:600;">Matter Ref</td><td style="padding:4px 0;">${escapeHtml(matterReference)}</td></tr>
        ${report.lookedUpAt ? `<tr><td style="padding:4px 0;font-weight:600;">Looked up</td><td style="padding:4px 0;">${escapeHtml(report.lookedUpAt)}</td></tr>` : ''}
      </table>
    </div>

    <!-- Company profile -->
    <div style="padding:20px 32px;border-bottom:1px solid #eee;">
      <h2 style="margin:0 0 12px;font-size:16px;color:#1a1a2e;">Company profile</h2>
      <table style="width:100%;border-collapse:collapse;">
        ${profileRow('Name', companyName)}
        ${profileRow('Number', companyNumber)}
        ${profileRow('Status', report.profile.status)}
        ${profileRow('Type', report.profile.type)}
        ${profileRow('Incorporated', report.profile.incorporated)}
        ${profileRow('Registered office', report.profile.address)}
        ${profileRow('SIC codes', sicCodes)}
        ${profileRow('Insolvency history', report.profile.insolvencyHistory === undefined ? undefined : (report.profile.insolvencyHistory ? 'Yes' : 'No'))}
      </table>
    </div>

    <!-- Officers -->
    <div style="padding:20px 32px;border-bottom:1px solid #eee;">
      <h2 style="margin:0 0 12px;font-size:16px;color:#1a1a2e;">Officers</h2>
      <table style="width:100%;border-collapse:collapse;">
        <thead>
          <tr>
            <th style="padding:6px 12px;text-align:left;background:#f8f9fa;font-size:12px;color:#666;font-weight:600;border-bottom:1px solid #ddd;">Name</th>
            <th style="padding:6px 12px;text-align:left;background:#f8f9fa;font-size:12px;color:#666;font-weight:600;border-bottom:1px solid #ddd;">Role</th>
          </tr>
        </thead>
        <tbody>
          ${officersHtml}
        </tbody>
      </table>
    </div>

    <!-- Persons with significant control -->
    <div style="padding:20px 32px;border-bottom:1px solid #eee;">
      <h2 style="margin:0 0 12px;font-size:16px;color:#1a1a2e;">Persons with significant control</h2>
      <table style="width:100%;border-collapse:collapse;">
        <thead>
          <tr>
            <th style="padding:6px 12px;text-align:left;background:#f8f9fa;font-size:12px;color:#666;font-weight:600;border-bottom:1px solid #ddd;">Name</th>
            <th style="padding:6px 12px;text-align:left;background:#f8f9fa;font-size:12px;color:#666;font-weight:600;border-bottom:1px solid #ddd;">Nature of control</th>
            <th style="padding:6px 12px;text-align:left;background:#f8f9fa;font-size:12px;color:#666;font-weight:600;border-bottom:1px solid #ddd;">Nationality</th>
          </tr>
        </thead>
        <tbody>
          ${pscsHtml}
        </tbody>
      </table>
    </div>

    <!-- Footer -->
    <div style="padding:16px 32px;background:#f8f9fa;border-top:1px solid #eee;text-align:center;">
      <p style="margin:0;font-size:11px;color:#999;">
        Generated by Eventus AML Compliance Hub on ${escapeHtml(generatedAt)} from a Companies House public-record lookup.
      </p>
    </div>

  </div>
</body>
</html>`;
}

/**
 * Get just the PSC names from a parsed CH report
 * (for items that need to enumerate beneficial owners to verify).
 */
export function getPscNames(report: CHReport | null): string[] {
  if (!report) return [];
  return report.pscs.map(p => p.name);
}
