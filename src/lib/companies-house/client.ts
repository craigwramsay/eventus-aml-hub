/**
 * Companies House API Client
 *
 * Fetches company profiles and officers from the Companies House REST API.
 * Uses Basic Auth: API key as username, empty password.
 */

import type { CompanyProfile, CompanyOfficer, CompanyPSC, CompanyLookupResult } from './types';

const CH_API_BASE = 'https://api.company-information.service.gov.uk';

/**
 * Validate a Companies House company number.
 * Valid formats: 8 digits (e.g. 12345678), or 2 letters + 6 digits (e.g. SC123456, NI123456).
 */
export function isValidCompanyNumber(companyNumber: string): boolean {
  return /^(?:\d{8}|[A-Z]{2}\d{6})$/.test(companyNumber.toUpperCase());
}

/**
 * Build the Basic Auth header for Companies House API.
 * The API key is used as the username with an empty password.
 */
function buildAuthHeader(apiKey: string): string {
  const encoded = Buffer.from(`${apiKey}:`).toString('base64');
  return `Basic ${encoded}`;
}

export class CompaniesHouseError extends Error {
  constructor(
    message: string,
    public readonly statusCode?: number
  ) {
    super(message);
    this.name = 'CompaniesHouseError';
  }
}

/**
 * Fetch a company profile from Companies House.
 */
async function fetchCompanyProfile(
  companyNumber: string,
  apiKey: string
): Promise<CompanyProfile> {
  const url = `${CH_API_BASE}/company/${encodeURIComponent(companyNumber)}`;

  const response = await fetch(url, {
    headers: {
      Authorization: buildAuthHeader(apiKey),
    },
  });

  if (!response.ok) {
    if (response.status === 404) {
      throw new CompaniesHouseError(
        `Company ${companyNumber} not found at Companies House`,
        404
      );
    }
    throw new CompaniesHouseError(
      `Companies House API error: ${response.status} ${response.statusText}`,
      response.status
    );
  }

  return response.json() as Promise<CompanyProfile>;
}

/**
 * Fetch active officers for a company from Companies House.
 */
async function fetchCompanyOfficers(
  companyNumber: string,
  apiKey: string
): Promise<CompanyOfficer[]> {
  const url = `${CH_API_BASE}/company/${encodeURIComponent(companyNumber)}/officers`;

  const response = await fetch(url, {
    headers: {
      Authorization: buildAuthHeader(apiKey),
    },
  });

  if (!response.ok) {
    if (response.status === 404) {
      return [];
    }
    throw new CompaniesHouseError(
      `Companies House officers API error: ${response.status} ${response.statusText}`,
      response.status
    );
  }

  const data = await response.json() as { items?: CompanyOfficer[] };
  const allOfficers = data.items || [];

  // Return only active officers (no resigned_on date)
  return allOfficers.filter((officer) => !officer.resigned_on);
}

/**
 * Fetch active persons with significant control for a company from Companies House.
 */
async function fetchPSCs(
  companyNumber: string,
  apiKey: string
): Promise<CompanyPSC[]> {
  const url = `${CH_API_BASE}/company/${encodeURIComponent(companyNumber)}/persons-with-significant-control`;

  const response = await fetch(url, {
    headers: {
      Authorization: buildAuthHeader(apiKey),
    },
  });

  if (!response.ok) {
    if (response.status === 404) {
      return [];
    }
    throw new CompaniesHouseError(
      `Companies House PSC API error: ${response.status} ${response.statusText}`,
      response.status
    );
  }

  const data = await response.json() as { items?: CompanyPSC[] };
  const allPSCs = data.items || [];

  // Return only active PSCs (no ceased_on date)
  return allPSCs.filter((psc) => !psc.ceased_on);
}

/**
 * Look up a company at Companies House.
 * Returns the company profile and active officers.
 *
 * @param companyNumber - The Companies House company number (8 digits or 2 letters + 6 digits)
 * @returns CompanyLookupResult with profile, active officers, and lookup timestamp
 * @throws CompaniesHouseError if the API call fails or company is not found
 */
export async function lookupCompany(
  companyNumber: string
): Promise<CompanyLookupResult> {
  const apiKey = process.env.COMPANIES_HOUSE_API_KEY;

  if (!apiKey) {
    throw new CompaniesHouseError(
      'COMPANIES_HOUSE_API_KEY environment variable is not set'
    );
  }

  const normalised = companyNumber.toUpperCase().trim();

  if (!isValidCompanyNumber(normalised)) {
    throw new CompaniesHouseError(
      `Invalid company number format: "${companyNumber}". Expected 8 digits or 2 letters followed by 6 digits.`
    );
  }

  const [profile, officers, pscs] = await Promise.all([
    fetchCompanyProfile(normalised, apiKey),
    fetchCompanyOfficers(normalised, apiKey),
    fetchPSCs(normalised, apiKey),
  ]);

  return {
    profile,
    officers,
    pscs,
    looked_up_at: new Date().toISOString(),
  };
}

/**
 * A single result row from the Companies House search-by-name endpoint.
 * Trimmed-down — only the fields we use for matching + populating clients.
 */
export interface CompanySearchHit {
  companyNumber: string;
  companyName: string;
  companyStatus: string;
  address: string;
  dateOfCreation: string | null;
}

/**
 * Search Companies House by company name.
 *
 * Used during Clio auto-import to populate the registered_number /
 * registered_address fields on newly created Hub clients. Conservative —
 * the caller decides what to do with multiple hits (typically: leave the
 * client blank rather than guess).
 *
 * The API is fuzzy by default (e.g. "ROCK 424 Ltd" matches "ROCK 424
 * LIMITED"). We filter post-fetch for active companies only and pass
 * everything else through.
 */
export async function searchCompaniesByName(
  query: string,
  options: { limit?: number; activeOnly?: boolean } = {}
): Promise<CompanySearchHit[]> {
  const apiKey = process.env.COMPANIES_HOUSE_API_KEY;
  if (!apiKey) {
    throw new CompaniesHouseError(
      'COMPANIES_HOUSE_API_KEY environment variable is not set'
    );
  }

  const trimmed = (query ?? '').trim();
  if (!trimmed) return [];

  const limit = options.limit ?? 20;
  const url = `${CH_API_BASE}/search/companies?q=${encodeURIComponent(trimmed)}&items_per_page=${limit}`;
  const response = await fetch(url, {
    headers: { Authorization: buildAuthHeader(apiKey) },
  });

  if (!response.ok) {
    if (response.status === 401 || response.status === 403) {
      throw new CompaniesHouseError(
        `Companies House auth failed (${response.status})`,
        response.status
      );
    }
    throw new CompaniesHouseError(
      `Companies House search failed: ${response.status} ${response.statusText}`,
      response.status
    );
  }

  type RawHit = {
    company_number?: string;
    title?: string;
    company_status?: string;
    address_snippet?: string;
    date_of_creation?: string;
  };
  const body = (await response.json()) as { items?: RawHit[] };
  const items = body.items ?? [];

  const hits: CompanySearchHit[] = items
    .filter((item) => !!item.company_number && !!item.title)
    .map((item) => ({
      companyNumber: item.company_number!,
      companyName: item.title!,
      companyStatus: item.company_status ?? 'unknown',
      address: item.address_snippet ?? '',
      dateOfCreation: item.date_of_creation ?? null,
    }));

  if (options.activeOnly) {
    return hits.filter((h) => h.companyStatus === 'active');
  }
  return hits;
}
