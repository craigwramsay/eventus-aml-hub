import { describe, it, expect } from 'vitest';
import { parseCHReport, generateCompaniesHouseHtml } from '../ch-report';

const RAW_CH = {
  profile: {
    company_name: 'ROCK 424 LTD',
    company_number: '12345678',
    company_status: 'active',
    type: 'ltd',
    date_of_creation: '2020-01-15',
    registered_office_address: {
      address_line_1: '1 Test Street',
      locality: 'Glasgow',
      postal_code: 'G1 1AA',
    },
    sic_codes: ['68100'],
    has_insolvency_history: false,
  },
  officers: [
    { name: 'Smith, John', officer_role: 'director', appointed_on: '2020-01-15' },
  ],
  pscs: [
    {
      name: 'Mr John Smith',
      natures_of_control: ['ownership-of-shares-75-to-100-percent'],
      nationality: 'British',
    },
  ],
  looked_up_at: '2026-06-25T10:00:00Z',
};

const BASE_PARAMS = {
  companyName: 'ROCK 424 LTD',
  companyNumber: '12345678',
  clientName: 'ROCK 424 LTD',
  matterReference: 'M-00012-2026',
  assessmentReference: 'A-00012-2026',
};

describe('generateCompaniesHouseHtml', () => {
  it('renders valid HTML with DOCTYPE and closing tags', () => {
    const report = parseCHReport(RAW_CH)!;
    const html = generateCompaniesHouseHtml({ ...BASE_PARAMS, report });
    expect(html).toMatch(/^<!DOCTYPE html>/);
    expect(html).toContain('</html>');
    expect(html).toContain('Companies House Report');
  });

  it('includes assessment context and company identifiers', () => {
    const report = parseCHReport(RAW_CH)!;
    const html = generateCompaniesHouseHtml({ ...BASE_PARAMS, report });
    expect(html).toContain('ROCK 424 LTD');
    expect(html).toContain('12345678');
    expect(html).toContain('A-00012-2026');
    expect(html).toContain('M-00012-2026');
  });

  it('renders officers and PSCs as table rows', () => {
    const report = parseCHReport(RAW_CH)!;
    const html = generateCompaniesHouseHtml({ ...BASE_PARAMS, report });
    expect(html).toContain('Smith, John');
    expect(html).toContain('director');
    expect(html).toContain('Mr John Smith');
    expect(html).toContain('Shares 75');
    expect(html).toContain('British');
  });

  it('handles missing officers and PSCs without crashing', () => {
    const report = parseCHReport({
      profile: { company_name: 'Empty Co', company_number: '99999999' },
    })!;
    const html = generateCompaniesHouseHtml({
      ...BASE_PARAMS,
      companyName: 'Empty Co',
      companyNumber: '99999999',
      report,
    });
    expect(html).toContain('No officers returned');
    expect(html).toContain('No PSCs returned');
  });

  it('escapes HTML in user-controlled fields', () => {
    const report = parseCHReport({
      profile: { company_name: '<script>alert(1)</script>' },
      officers: [{ name: '<b>Evil</b>', officer_role: 'director' }],
      pscs: [],
    })!;
    const html = generateCompaniesHouseHtml({
      ...BASE_PARAMS,
      companyName: '<script>alert(1)</script>',
      clientName: '"; DROP TABLE clients; --',
      report,
    });
    expect(html).not.toContain('<script>alert(1)</script>');
    expect(html).toContain('&lt;script&gt;');
    expect(html).toContain('&lt;b&gt;Evil&lt;/b&gt;');
    expect(html).toContain('&quot;; DROP TABLE clients; --');
  });
});
