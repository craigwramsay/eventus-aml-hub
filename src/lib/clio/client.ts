/**
 * Clio API Client
 *
 * Fetches matters and contacts from the Clio Manage REST API v4.
 * Handles OAuth token exchange, refresh, and webhook management.
 */

import type {
  ClioMatter,
  ClioContact,
  ClioTokenResponse,
  ClioWebhookResponse,
  ClioApiResponse,
  ClioFolder,
  ClioDocument,
  ClioFolderListResponse,
} from './types';

export class ClioError extends Error {
  constructor(
    message: string,
    public readonly statusCode?: number,
    public readonly rateLimitReset?: string | null
  ) {
    super(message);
    this.name = 'ClioError';
  }
}

/**
 * Get the Clio API base URL based on CLIO_REGION env var.
 * Defaults to app.clio.com (US). Set CLIO_REGION=eu for EU.
 */
export function getClioBaseUrl(): string {
  const region = process.env.CLIO_REGION?.toLowerCase();
  if (region === 'eu') {
    return 'https://eu.app.clio.com';
  }
  return 'https://app.clio.com';
}

/**
 * Generic authenticated fetch for Clio API.
 * Handles rate limiting headers and common error cases.
 */
async function clioFetch<T>(path: string, accessToken: string, options?: RequestInit): Promise<T> {
  const baseUrl = getClioBaseUrl();
  const url = `${baseUrl}${path}`;

  const response = await fetch(url, {
    ...options,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
      ...options?.headers,
    },
  });

  if (response.status === 429) {
    const retryAfter = response.headers.get('Retry-After');
    throw new ClioError(
      'Clio API rate limit exceeded',
      429,
      retryAfter
    );
  }

  if (!response.ok) {
    throw new ClioError(
      `Clio API error: ${response.status} ${response.statusText}`,
      response.status
    );
  }

  return response.json() as Promise<T>;
}

/**
 * Fetch a matter from Clio by ID with client relationship.
 */
export async function fetchClioMatter(
  matterId: number,
  accessToken: string
): Promise<ClioMatter> {
  const fields = 'id,etag,display_number,description,status,client{id,name,type}';
  const data = await clioFetch<ClioApiResponse<ClioMatter>>(
    `/api/v4/matters/${matterId}.json?fields=${encodeURIComponent(fields)}`,
    accessToken
  );
  return data.data;
}

/**
 * Fetch a contact from Clio by ID.
 */
export async function fetchClioContact(
  contactId: number,
  accessToken: string
): Promise<ClioContact> {
  const fields = 'id,etag,name,type,first_name,last_name,email_addresses';
  const data = await clioFetch<ClioApiResponse<ClioContact>>(
    `/api/v4/contacts/${contactId}.json?fields=${encodeURIComponent(fields)}`,
    accessToken
  );
  return data.data;
}

/**
 * Exchange an authorization code for tokens.
 */
export async function exchangeClioCode(code: string): Promise<ClioTokenResponse> {
  const baseUrl = getClioBaseUrl();
  const clientId = process.env.CLIO_CLIENT_ID;
  const clientSecret = process.env.CLIO_CLIENT_SECRET;

  if (!clientId || !clientSecret) {
    throw new ClioError('CLIO_CLIENT_ID and CLIO_CLIENT_SECRET must be set');
  }

  const params = new URLSearchParams({
    grant_type: 'authorization_code',
    code,
    client_id: clientId,
    client_secret: clientSecret,
    redirect_uri: `${process.env.NEXT_PUBLIC_APP_URL}/api/integrations/clio/callback`,
  });

  const response = await fetch(`${baseUrl}/oauth/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: params.toString(),
  });

  if (!response.ok) {
    throw new ClioError(
      `Clio token exchange failed: ${response.status} ${response.statusText}`,
      response.status
    );
  }

  return response.json() as Promise<ClioTokenResponse>;
}

/**
 * Refresh an access token using a refresh token.
 */
export async function refreshClioToken(refreshToken: string): Promise<ClioTokenResponse> {
  const baseUrl = getClioBaseUrl();
  const clientId = process.env.CLIO_CLIENT_ID;
  const clientSecret = process.env.CLIO_CLIENT_SECRET;

  if (!clientId || !clientSecret) {
    throw new ClioError('CLIO_CLIENT_ID and CLIO_CLIENT_SECRET must be set');
  }

  const params = new URLSearchParams({
    grant_type: 'refresh_token',
    refresh_token: refreshToken,
    client_id: clientId,
    client_secret: clientSecret,
  });

  const response = await fetch(`${baseUrl}/oauth/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: params.toString(),
  });

  if (!response.ok) {
    throw new ClioError(
      `Clio token refresh failed: ${response.status} ${response.statusText}`,
      response.status
    );
  }

  return response.json() as Promise<ClioTokenResponse>;
}

/**
 * Register a webhook with Clio.
 * Clio webhooks expire after max 31 days.
 */
export async function registerClioWebhook(
  accessToken: string,
  url: string,
  events: string[]
): Promise<ClioWebhookResponse> {
  // Clio allows up to 31 days — set to 30 days for buffer
  const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();

  return clioFetch<ClioWebhookResponse>('/api/v4/webhooks.json', accessToken, {
    method: 'POST',
    body: JSON.stringify({
      data: {
        url,
        fields: ['id', 'etag', 'display_number', 'description', 'status'],
        events,
        model: 'matter',
        expires_at: expiresAt,
      },
    }),
  });
}

/**
 * Delete a webhook from Clio.
 */
export async function deleteClioWebhook(
  accessToken: string,
  webhookId: string
): Promise<void> {
  const baseUrl = getClioBaseUrl();
  const response = await fetch(`${baseUrl}/api/v4/webhooks/${webhookId}.json`, {
    method: 'DELETE',
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  });

  if (!response.ok && response.status !== 404) {
    throw new ClioError(
      `Failed to delete Clio webhook: ${response.status}`,
      response.status
    );
  }
}

// ── Clio Drive: Folder & Document Operations ──────────────────────────

/**
 * Find a folder by name under a Clio matter.
 * Returns null if not found.
 */
export async function findClioFolder(
  clioMatterId: number,
  folderName: string,
  accessToken: string
): Promise<ClioFolder | null> {
  const fields = 'id,etag,name,parent,created_at,updated_at';
  const params = new URLSearchParams({
    fields,
    parent_id: String(clioMatterId),
    parent_type: 'Matter',
    name: folderName,
  });

  const data = await clioFetch<ClioFolderListResponse>(
    `/api/v4/folders.json?${params.toString()}`,
    accessToken
  );

  return data.data.length > 0 ? data.data[0] : null;
}

/**
 * Create a folder under a Clio matter.
 */
export async function createClioFolder(
  clioMatterId: number,
  folderName: string,
  accessToken: string
): Promise<ClioFolder> {
  const fields = 'id,etag,name,parent,created_at,updated_at';
  const data = await clioFetch<ClioApiResponse<ClioFolder>>(
    `/api/v4/folders.json?fields=${encodeURIComponent(fields)}`,
    accessToken,
    {
      method: 'POST',
      body: JSON.stringify({
        data: {
          name: folderName,
          parent: { id: clioMatterId, type: 'Matter' },
        },
      }),
    }
  );

  return data.data;
}

/**
 * Find or create the "Compliance" folder under a Clio matter.
 * Idempotent: returns existing folder if already present.
 * Handles race conditions (concurrent creates) by catching errors and re-finding.
 */
export async function ensureComplianceFolder(
  clioMatterId: number,
  accessToken: string
): Promise<ClioFolder> {
  const folderName = 'Compliance';

  // Try to find existing folder first
  const existing = await findClioFolder(clioMatterId, folderName, accessToken);
  if (existing) return existing;

  // Create the folder — handle race condition where another request creates it first
  try {
    return await createClioFolder(clioMatterId, folderName, accessToken);
  } catch (err) {
    if (err instanceof ClioError && (err.statusCode === 422 || err.statusCode === 409)) {
      // Race condition: folder was created by another concurrent request
      const retryFind = await findClioFolder(clioMatterId, folderName, accessToken);
      if (retryFind) return retryFind;
    }
    throw err;
  }
}

/**
 * Upload a document to Clio Drive (3-step process).
 *
 * 1. POST /documents.json → create record + get pre-signed S3 URL
 * 2. PUT file bytes to S3
 * 3. PATCH to mark fully_uploaded
 */
export async function uploadDocumentToClio(
  folderId: number,
  fileName: string,
  fileContent: Buffer | Uint8Array,
  contentType: string,
  accessToken: string
): Promise<ClioDocument> {
  // Step 1: Create document record
  const fields = 'id,name,latest_document_version{uuid,put_url,put_headers}';
  const createResult = await clioFetch<ClioApiResponse<ClioDocument>>(
    `/api/v4/documents.json?fields=${encodeURIComponent(fields)}`,
    accessToken,
    {
      method: 'POST',
      body: JSON.stringify({
        data: {
          name: fileName,
          parent: { id: folderId, type: 'Folder' },
        },
      }),
    }
  );

  const doc = createResult.data;
  const version = doc.latest_document_version;
  if (!version?.put_url) {
    throw new ClioError('Clio did not return a put_url for document upload');
  }

  // Step 2: PUT file bytes to the pre-signed S3 URL
  const putHeaders: Record<string, string> = {};
  for (const h of version.put_headers) {
    putHeaders[h.name] = h.value;
  }
  putHeaders['Content-Type'] = contentType;
  putHeaders['Content-Length'] = String(fileContent.byteLength);

  const putResponse = await fetch(version.put_url, {
    method: 'PUT',
    headers: putHeaders,
    body: new Uint8Array(fileContent),
  });

  if (!putResponse.ok) {
    throw new ClioError(
      `S3 upload failed: ${putResponse.status} ${putResponse.statusText}`,
      putResponse.status
    );
  }

  // Step 3: PATCH to mark fully_uploaded
  await clioFetch<ClioApiResponse<ClioDocument>>(
    `/api/v4/documents/${doc.id}.json`,
    accessToken,
    {
      method: 'PATCH',
      body: JSON.stringify({
        data: {
          latest_document_version: {
            uuid: version.uuid,
            fully_uploaded: true,
          },
        },
      }),
    }
  );

  return doc;
}

/**
 * Build the Clio web UI URL for a document.
 * Uses the Clio Manage hash-based routing format.
 */
export function getClioDocumentUrl(documentId: number): string {
  const baseUrl = getClioBaseUrl();
  return `${baseUrl}/nc/#/documents/${documentId}`;
}
