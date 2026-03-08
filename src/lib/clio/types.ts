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
  /** Clio uses 'action' (e.g. 'matter.create', 'matter.updated') — NOT 'type'. */
  action: string;
  data: {
    id: number;
    url?: string;
    etag?: string;
    [key: string]: unknown;
  };
}

export interface ClioApiResponse<T> {
  data: T;
}

/** Clio Drive Folder */
export interface ClioFolder {
  id: number;
  etag: string;
  name: string;
  parent: { id: number; type: string } | null;
  created_at: string;
  updated_at: string;
}

/** Clio Drive Document (with version info for upload) */
export interface ClioDocument {
  id: number;
  etag?: string;
  name: string;
  latest_document_version?: {
    uuid: string;
    put_url: string;
    put_headers: Array<{ name: string; value: string }>;
  };
  created_at?: string;
  updated_at?: string;
}

/** Clio folder list response */
export interface ClioFolderListResponse {
  data: ClioFolder[];
}
