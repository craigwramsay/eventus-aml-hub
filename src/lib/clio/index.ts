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
  exchangeClioCode,
  refreshClioToken,
  registerClioWebhook,
  listClioWebhooks,
  deleteClioWebhook,
  findClioFolder,
  createClioFolder,
  ensureComplianceFolder,
  uploadDocumentToClio,
  getClioDocumentUrl,
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

export { generateSowHtml, generateSofHtml } from './sow-sof-html';
export type { SowHtmlParams, SofHtmlParams } from './sow-sof-html';
