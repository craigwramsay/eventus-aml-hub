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
 * Format an Amiqus client name as a single string ("Alexandra Inglis").
 *
 * Amiqus's /clients/{id} response wraps the name in a structured object with
 * several representations:
 *   - `name.full_name` / `name.name` — already concatenated
 *   - `name.first_name` + `name.middle_name` + `name.last_name` — parts
 *   - older shape: `name.first` + `name.last`
 *
 * Prefers the pre-concatenated `full_name`, falling back through the part-
 * based shapes. Returns empty string when none are usable.
 */
export function formatAmiqusClientName(client: AmiqusClient): string {
  const n = client.name;
  if (!n) return '';

  const trimOrEmpty = (v: unknown) => (typeof v === 'string' ? v.trim() : '');

  const fullName = trimOrEmpty(n.full_name) || trimOrEmpty(n.name);
  if (fullName) return fullName;

  const newShape = [n.first_name, n.middle_name, n.last_name]
    .map(trimOrEmpty)
    .filter(Boolean)
    .join(' ');
  if (newShape) return newShape;

  const oldShape = [n.first, n.last].map(trimOrEmpty).filter(Boolean).join(' ');
  return oldShape;
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
 * Extract the Amiqus client ID from a response.
 *
 * Amiqus returns the linked client in three different shapes depending on
 * the endpoint:
 *   - top-level `client_id: number` (older /records responses)
 *   - top-level `client: number` (current /cases responses — the ID directly)
 *   - top-level `client: { id: number }` (some expanded responses)
 *
 * Returns 0 as a fallback (stored as null in the DB).
 */
function extractClientId(data: { client_id?: number; client?: number | { id: number } }): number {
  if (typeof data.client_id === 'number') return data.client_id;
  if (typeof data.client === 'number') return data.client;
  if (data.client && typeof data.client === 'object' && typeof data.client.id === 'number') {
    return data.client.id;
  }
  return 0;
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
): Promise<{ type: 'record' | 'case'; data: { id: number; status: string; client_id: number; completed_at: string | null; updated_at: string | null } }> {
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
        updated_at: caseData.updated_at ?? null,
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
      updated_at: record.updated_at ?? null,
    },
  };
}

/**
 * List webhooks registered with Amiqus.
 * The API may return either a bare array or a wrapper like `{ data: [...] }`,
 * so we coerce both shapes. Used as a lightweight ping in the diagnostic.
 */
export async function listAmiqusWebhooks(
  apiKey: string
): Promise<AmiqusWebhookResponse[]> {
  const raw = await amiqusFetch<unknown>('/webhooks', apiKey);
  if (Array.isArray(raw)) return raw as AmiqusWebhookResponse[];
  if (raw && typeof raw === 'object' && Array.isArray((raw as { data?: unknown }).data)) {
    return (raw as { data: AmiqusWebhookResponse[] }).data;
  }
  return [];
}

/**
 * Generic GET against the Amiqus API returning the raw parsed JSON.
 * Used by diagnostic tooling to inspect the actual response shape when
 * the typed helpers can't extract the expected fields.
 */
export async function getAmiqusRaw(
  path: string,
  apiKey: string
): Promise<unknown> {
  return amiqusFetch<unknown>(path, apiKey);
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
