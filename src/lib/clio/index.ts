/**
 * Clio Integration Module
 *
 * Client for the Clio Manage REST API v4.
 * Used for OAuth, syncing matters/contacts, webhook management, and Drive sync.
 */

export {
  ClioError,
  getClioBaseUrl,
  fetchClioMatter,
  listClioMattersCreatedSince,
  fetchClioContact,
  searchClioContacts,
  exchangeClioCode,
  refreshClioToken,
  registerClioWebhook,
  listClioWebhooks,
  deleteClioWebhook,
  findClioFolder,
  createClioFolder,
  ensureComplianceFolder,
  uploadDocumentToClio,
  deleteClioDocument,
  listClioFolderDocuments,
  getClioDocumentUrl,
  buildClioContactUrl,
  buildClioMatterUrl,
} from './client';

export type {
  ClioMatter,
  ClioContact,
  ClioTokenResponse,
  ClioMattersPageResponse,
  ClioWebhookResponse,
  ClioWebhookListItem,
  ClioWebhookListResponse,
  ClioWebhookPayload,
  ClioApiResponse,
  ClioFolder,
  ClioDocument,
  ClioFolderListResponse,
} from './types';

export { getClioAccessTokenForFirm } from './token';

export { normalizeClientName } from './name-normaliser';

export {
  isFeeVariantOf,
  findFeeVariantMain,
  isStandaloneAdminMatter,
  classifyStandaloneAdminMatter,
} from './fee-variant';

export {
  promoteGenericEntityType,
  enrichClioImportedClient,
} from './post-import-enrichment';
export type { EnrichmentOutcome } from './post-import-enrichment';

export { generateSowHtml, generateSofHtml } from './sow-sof-html';
export type { SowHtmlParams, SofHtmlParams } from './sow-sof-html';
