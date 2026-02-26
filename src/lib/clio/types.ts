/**
 * Clio API Types
 *
 * Types for the Clio Manage REST API v4 responses.
 * See: https://docs.developers.clio.com/
 */

export interface ClioMatter {
  id: number;
  etag: string;
  display_number: string;
  description: string | null;
  status: string;
  client: {
    id: number;
    name: string;
    type: string;
  } | null;
}

export interface ClioContact {
  id: number;
  etag: string;
  name: string;
  type: string;
  first_name: string | null;
  last_name: string | null;
  email_addresses: Array<{
    name: string;
    address: string;
    default_email: boolean;
  }>;
}

export interface ClioTokenResponse {
  access_token: string;
  refresh_token: string;
  token_type: string;
  expires_in: number;
}

export interface ClioWebhookResponse {
  data: {
    id: number;
    etag: string;
    url: string;
    fields: string[];
    events: string[];
    model: string;
    status: string;
    shared_secret: string;
    expires_at: string;
    created_at: string;
    updated_at: string;
  };
}

export interface ClioWebhookPayload {
  type: string;
  data: {
    id: number;
    url: string;
    etag?: string;
  };
}

export interface ClioApiResponse<T> {
  data: T;
}
