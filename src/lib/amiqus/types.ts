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

/**
 * Amiqus webhook payload.
 *
 * The current (nested) shape looks like:
 *   {
 *     webhook: { uuid, events },
 *     trigger: { triggered_at, alias },     // event name lives here as 'alias'
 *     data: {
 *       record: { id, type, status?, completed_at? },  // type = 'client' | 'organisation' | …
 *       client: { id, ... }
 *     }
 *   }
 *
 * An older (flat) shape may still exist in some historical events:
 *   { event, data: { id, status, client_id, completed_at } }
 *
 * Both are accepted; the handler normalises them into a single internal form.
 * See `normaliseAmiqusWebhook` in the webhook route.
 */
export interface AmiqusWebhookPayload {
  /** Legacy flat-shape event name. */
  event?: string;
  webhook?: { uuid?: string; events?: string[] };
  trigger?: { triggered_at?: string; alias?: string };
  data: {
    /** Nested (current) shape */
    record?: {
      id: number;
      /** Discriminator added by Amiqus: 'client' | 'organisation'. Absent on
       *  older payloads; treat as 'client' when missing per Amiqus guidance. */
      type?: string;
      status?: string;
      completed_at?: string | null;
    };
    client?: { id: number };
    /** Legacy flat shape (kept optional so we don't error on it) */
    id?: number;
    status?: string;
    client_id?: number;
    completed_at?: string | null;
    type?: string;
  };
}
