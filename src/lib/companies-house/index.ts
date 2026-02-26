/**
 * Companies House Module
 *
 * Client for the Companies House REST API.
 * Used to verify corporate entity existence and retrieve officer details.
 */

export { lookupCompany, isValidCompanyNumber, CompaniesHouseError } from './client';
export type { CompanyProfile, CompanyOfficer, CompanyPSC, CompanyLookupResult } from './types';
