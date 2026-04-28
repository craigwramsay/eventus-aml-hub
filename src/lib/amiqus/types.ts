/**
 * Amiqus API Types
 *
 * Types for the Amiqus Identity Verification REST API v2.
 * See: https://developers.amiqus.co/
 */

export interface AmiqusClient {
  id: number;
  name: {
    first: string;
    last: string;
  };
  email: string;
  created_at: string;
}

export interface AmiqusRecordStep {
  type: string;
  config?: Record<string, unknown>;
}

/**
 * Amiqus API can return the client in three shapes depending on the endpoint:
 *   - `client_id: number` (older /records responses)
 *   - `client: number` (current /cases responses — ID directly)
 *   - `client: { id: number }` (some expanded responses)
 * Use `extractAmiqusClientId()` from the client module to handle all three.
 */
export interface AmiqusRecord {
  id: number;
  status: string;
  perform_url: string;
  client_id?: number;
  client?: number | { id: number };
  created_at: string;
  updated_at: string;
  completed_at: string | null;
}

export interface AmiqusCase {
  id: number;
  status: string;
  client_id?: number;
  client?: number | { id: number };
  created_at: string;
  updated_at: string;
  completed_at: string | null;
}

export interface AmiqusWebhookResponse {
  id: number;
  url: string;
  events: string[];
  secret: string;
  created_at: string;
}

export interface AmiqusWebhookPayload {
  event: string;
  data: {
    id: number;
    status: string;
    client_id: number;
    completed_at?: string | null;
  };
}
