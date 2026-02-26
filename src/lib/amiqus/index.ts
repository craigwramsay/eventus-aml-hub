/**
 * Amiqus Integration Module
 *
 * Client for the Amiqus Identity Verification API v2.
 * Used to initiate ID verification and track status.
 * Reports stay in Amiqus — hub stores only record ID, status, date, and link.
 */

export {
  AmiqusError,
  getAmiqusApiKey,
  createAmiqusClient,
  createAmiqusRecord,
  getAmiqusRecord,
  registerAmiqusWebhook,
} from './client';

export type {
  AmiqusClient,
  AmiqusRecord,
  AmiqusRecordStep,
  AmiqusWebhookResponse,
  AmiqusWebhookPayload,
} from './types';
