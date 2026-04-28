/**
 * Amiqus API Types
 *
 * Types for the Amiqus Identity Verification REST API v2.
 * See: https://developers.amiqus.co/
 */

/**
 * Amiqus client object. The `name` field is wrapped in a structured object
 * with several pre-concatenated representations (`name`, `full_name`,
 * `complete_name`) plus the parts (`first_name`, `middle_name`, `last_name`).
 * Older API responses used `{ first, last }` instead — both shapes are kept
 * optional so we can handle either.
 */
export interface AmiqusClient {
  id: number;
  name?: {
    title?: string | null;
    first_name?: string | null;
    middle_name?: string | null;
    last_name?: string | null;
    name?: string | null;
    full_name?: string | null;
    complete_name?: string | null;
    /** Older API shape — kept for back-compat */
    first?: string | null;
    last?: string | null;
  };
  email?: string;
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
