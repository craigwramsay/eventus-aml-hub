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

export interface AmiqusRecord {
  id: number;
  status: string;
  perform_url: string;
  client_id: number;
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
