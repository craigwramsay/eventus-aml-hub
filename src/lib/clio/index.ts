/**
 * Clio Integration Module
 *
 * Client for the Clio Manage REST API v4.
 * Used for OAuth, syncing matters/contacts, and webhook management.
 */

export {
  ClioError,
  getClioBaseUrl,
  fetchClioMatter,
  fetchClioContact,
  exchangeClioCode,
  refreshClioToken,
  registerClioWebhook,
  deleteClioWebhook,
} from './client';

export type {
  ClioMatter,
  ClioContact,
  ClioTokenResponse,
  ClioWebhookResponse,
  ClioWebhookPayload,
  ClioApiResponse,
} from './types';
