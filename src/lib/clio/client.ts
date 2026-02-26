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

  const response = await fetch(`${baseUrl}/oauth/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      grant_type: 'authorization_code',
      code,
      client_id: clientId,
      client_secret: clientSecret,
      redirect_uri: `${process.env.NEXT_PUBLIC_APP_URL}/api/integrations/clio/callback`,
    }),
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

  const response = await fetch(`${baseUrl}/oauth/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      grant_type: 'refresh_token',
      refresh_token: refreshToken,
      client_id: clientId,
      client_secret: clientSecret,
    }),
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
  // Max 31 days from now
  const expiresAt = new Date(Date.now() + 31 * 24 * 60 * 60 * 1000).toISOString();

  return clioFetch<ClioWebhookResponse>('/api/v4/webhooks.json', accessToken, {
    method: 'POST',
    body: JSON.stringify({
      data: {
        url,
        fields: ['id', 'etag', 'display_number', 'description', 'status'],
        events,
        model: 'Matter',
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
