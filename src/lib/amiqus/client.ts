/**
 * Amiqus API Client
 *
 * Creates clients, records, and manages webhooks via the Amiqus API v2.
 * Auth: Bearer token from AMIQUS_API_KEY env var (Personal Access Token).
 * Reports (sensitive PII) stay in Amiqus — hub stores only record ID, status, date, and link.
 */

import type {
  AmiqusClient,
  AmiqusRecord,
  AmiqusRecordStep,
  AmiqusWebhookResponse,
} from './types';

const AMIQUS_API_BASE = 'https://id.amiqus.co/api/v2';

export class AmiqusError extends Error {
  constructor(
    message: string,
    public readonly statusCode?: number
  ) {
    super(message);
    this.name = 'AmiqusError';
  }
}

/**
 * Get the Amiqus API key from env.
 * Returns null if not configured.
 */
export function getAmiqusApiKey(): string | null {
  return process.env.AMIQUS_API_KEY || null;
}

/**
 * Generic authenticated fetch for Amiqus API.
 */
async function amiqusFetch<T>(
  path: string,
  apiKey: string,
  options?: RequestInit
): Promise<T> {
  const url = `${AMIQUS_API_BASE}${path}`;

  const response = await fetch(url, {
    ...options,
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
      Accept: 'application/json',
      ...options?.headers,
    },
  });

  if (!response.ok) {
    throw new AmiqusError(
      `Amiqus API error: ${response.status} ${response.statusText}`,
      response.status
    );
  }

  return response.json() as Promise<T>;
}

/**
 * Create a client in Amiqus.
 */
export async function createAmiqusClient(
  firstName: string,
  lastName: string,
  email: string,
  apiKey: string
): Promise<AmiqusClient> {
  return amiqusFetch<AmiqusClient>('/clients', apiKey, {
    method: 'POST',
    body: JSON.stringify({
      name: { first: firstName, last: lastName },
      email,
    }),
  });
}

/**
 * Create a verification record in Amiqus.
 * Returns the record with perform_url for the client to complete.
 */
export async function createAmiqusRecord(
  clientId: number,
  steps: AmiqusRecordStep[],
  apiKey: string
): Promise<AmiqusRecord> {
  return amiqusFetch<AmiqusRecord>('/records', apiKey, {
    method: 'POST',
    body: JSON.stringify({
      client_id: clientId,
      steps,
    }),
  });
}

/**
 * Get a verification record from Amiqus by ID.
 */
export async function getAmiqusRecord(
  recordId: number,
  apiKey: string
): Promise<AmiqusRecord> {
  return amiqusFetch<AmiqusRecord>(`/records/${recordId}`, apiKey);
}

/**
 * Register a webhook with Amiqus.
 * Returns the webhook including the shared secret.
 */
export async function registerAmiqusWebhook(
  url: string,
  events: string[],
  apiKey: string
): Promise<AmiqusWebhookResponse> {
  return amiqusFetch<AmiqusWebhookResponse>('/webhooks', apiKey, {
    method: 'POST',
    body: JSON.stringify({ url, events }),
  });
}
