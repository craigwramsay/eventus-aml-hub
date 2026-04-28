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
  AmiqusCase,
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
 * Get a client from Amiqus by ID. Returns the full client record including name.
 */
export async function getAmiqusClient(
  clientId: number,
  apiKey: string
): Promise<AmiqusClient> {
  return amiqusFetch<AmiqusClient>(`/clients/${clientId}`, apiKey);
}

/**
 * Format an Amiqus client name as a single string ("Alice Smith").
 * Trims and skips empty parts.
 */
export function formatAmiqusClientName(client: AmiqusClient): string {
  const first = (client.name?.first || '').trim();
  const last = (client.name?.last || '').trim();
  return [first, last].filter(Boolean).join(' ');
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
 * Get a case from Amiqus by ID.
 */
export async function getAmiqusCase(
  caseId: number,
  apiKey: string
): Promise<AmiqusCase> {
  return amiqusFetch<AmiqusCase>(`/cases/${caseId}`, apiKey);
}

/**
 * Extract the Amiqus client ID from a response, handling both
 * top-level `client_id` and nested `client.id` shapes.
 */
function extractClientId(data: { client_id?: number; client?: { id: number } }): number {
  if (typeof data.client_id === 'number') return data.client_id;
  if (data.client && typeof data.client.id === 'number') return data.client.id;
  return 0; // fallback (will be stored as null/0)
}

/**
 * Try to find an Amiqus record or case by ID.
 * Tries /cases/{id} first (preferred — case IDs match dashboard URLs),
 * then /records/{id} if not found.
 * Returns a normalised shape with the resource type and client_id.
 */
export async function getAmiqusRecordOrCase(
  id: number,
  apiKey: string
): Promise<{ type: 'record' | 'case'; data: { id: number; status: string; client_id: number; completed_at: string | null } }> {
  // Try cases first (preferred — case IDs match the Amiqus dashboard URL format)
  try {
    const caseData = await getAmiqusCase(id, apiKey);
    return {
      type: 'case',
      data: {
        id: caseData.id,
        status: caseData.status,
        client_id: extractClientId(caseData),
        completed_at: caseData.completed_at,
      },
    };
  } catch (err) {
    if (!(err instanceof AmiqusError) || err.statusCode !== 404) {
      throw err; // Re-throw non-404 errors
    }
  }

  // Fall back to records
  const record = await getAmiqusRecord(id, apiKey);
  return {
    type: 'record',
    data: {
      id: record.id,
      status: record.status,
      client_id: extractClientId(record),
      completed_at: record.completed_at,
    },
  };
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

/**
 * Delete a webhook from Amiqus.
 */
export async function deleteAmiqusWebhook(
  webhookId: string | number,
  apiKey: string
): Promise<void> {
  await amiqusFetch<unknown>(`/webhooks/${webhookId}`, apiKey, {
    method: 'DELETE',
  });
}
