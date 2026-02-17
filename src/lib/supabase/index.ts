/**
 * Supabase Client Exports
 */

export { createClient as createServerClient, getUser, getUserProfile } from './server';
export { createClient as createBrowserClient } from './client';
export type {
  Database,
  Json,
  RiskLevel,
  SourceType,
  UserProfile,
  Firm,
  Client,
  Matter,
  Assessment,
  AuditEvent,
  AssistantSource,
} from './types';
