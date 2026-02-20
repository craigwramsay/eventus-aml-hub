/**
 * Companies House API Types
 *
 * Types for the Companies House REST API responses.
 * See: https://developer.company-information.service.gov.uk/
 */

export interface CompanyProfile {
  company_name: string;
  company_number: string;
  company_status: string;
  type: string;
  date_of_creation: string;
  registered_office_address: {
    address_line_1: string;
    address_line_2?: string;
    locality: string;
    region?: string;
    postal_code: string;
    country?: string;
  };
  sic_codes?: string[];
  has_charges?: boolean;
  has_insolvency_history?: boolean;
  registered_office_is_in_dispute?: boolean;
  accounts?: {
    next_due: string;
    last_accounts?: { made_up_to: string };
  };
  confirmation_statement?: {
    next_due: string;
    last_made_up_to?: string;
  };
}

export interface CompanyOfficer {
  name: string;
  officer_role: string;
  appointed_on: string;
  resigned_on?: string;
  nationality?: string;
  date_of_birth?: { month: number; year: number };
  address: {
    address_line_1: string;
    locality: string;
    postal_code: string;
  };
}

export interface CompanyLookupResult {
  profile: CompanyProfile;
  officers: CompanyOfficer[];
  looked_up_at: string;
}
