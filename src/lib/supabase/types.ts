/**
 * Supabase Database Types
 *
 * Simplified types for the assessment tables.
 * For full type generation, use: npx supabase gen types typescript
 */

export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export type RiskLevel = 'LOW' | 'MEDIUM' | 'HIGH';

import type { UserRole } from '@/lib/auth/roles';

// Row types for reading from database
export interface UserProfile {
  user_id: string;
  firm_id: string;
  email: string | null;
  full_name: string | null;
  role: UserRole;
  created_at: string;
}

export type Jurisdiction = 'scotland' | 'england_and_wales';

export interface Firm {
  id: string;
  name: string;
  jurisdiction: Jurisdiction;
  created_at: string;
  updated_at: string;
}

export interface Client {
  id: string;
  firm_id: string;
  name: string;
  entity_type: string;
  client_type: string;
  sector: string;
  clio_contact_id?: string | null;
  registered_number?: string | null;
  registered_address?: string | null;
  trading_address?: string | null;
  aml_regulated?: boolean;
  created_at: string;
  updated_at: string;
}


export interface Matter {
  id: string;
  firm_id: string;
  client_id: string;
  reference: string;
  description: string | null;
  status: string;
  created_at: string;
  updated_at: string;
}

export interface Assessment {
  id: string;
  firm_id: string;
  matter_id: string;
  input_snapshot: Json;
  output_snapshot: Json;
  risk_level: RiskLevel;
  score: number;
  created_at: string;
  created_by: string;
  finalised_at: string | null;
  finalised_by: string | null;
}

export interface AuditEvent {
  id: string;
  firm_id: string;
  entity_type: string;
  entity_id: string;
  action: string;
  metadata: Json | null;
  created_at: string;
  created_by: string;
}

export interface UserInvitation {
  id: string;
  firm_id: string;
  email: string;
  role: UserRole;
  invited_by: string;
  accepted_at: string | null;
  created_at: string;
}

export type SourceType = 'external' | 'internal';

export interface AssistantSource {
  id: string;
  firm_id: string;
  source_type: SourceType;
  source_name: string;
  section_ref: string;
  topics: string[];
  content: string;
  effective_date: string | null;
  created_at: string;
  updated_at: string;
}

// Database schema type for Supabase client
// Using 'any' for table operations to avoid complex generics
// Real projects should use generated types from Supabase CLI
export interface Database {
  public: {
    Tables: {
      user_profiles: {
        Row: UserProfile;
        Insert: Partial<UserProfile> & Pick<UserProfile, 'user_id' | 'firm_id'>;
        Update: Partial<UserProfile>;
      };
      firms: {
        Row: Firm;
        Insert: Partial<Firm> & Pick<Firm, 'name'>;
        Update: Partial<Firm>;
      };
      clients: {
        Row: Client;
        Insert: Partial<Client> & Pick<Client, 'firm_id' | 'name' | 'entity_type'>;
        Update: Partial<Client>;
      };
      matters: {
        Row: Matter;
        Insert: Partial<Matter> & Pick<Matter, 'firm_id' | 'client_id' | 'reference'>;
        Update: Partial<Matter>;
      };
      assessments: {
        Row: Assessment;
        Insert: Partial<Assessment> & Pick<Assessment, 'firm_id' | 'matter_id' | 'input_snapshot' | 'output_snapshot' | 'risk_level' | 'score' | 'created_by'>;
        Update: Pick<Assessment, 'finalised_at' | 'finalised_by'>;
      };
      audit_events: {
        Row: AuditEvent;
        Insert: Partial<AuditEvent> & Pick<AuditEvent, 'firm_id' | 'entity_type' | 'entity_id' | 'action' | 'created_by'>;
        Update: Partial<AuditEvent>;
      };
      assistant_sources: {
        Row: AssistantSource;
        Insert: Partial<AssistantSource> & Pick<AssistantSource, 'firm_id' | 'source_type' | 'source_name' | 'section_ref' | 'topics' | 'content'>;
        Update: Partial<AssistantSource>;
      };
      user_invitations: {
        Row: UserInvitation;
        Insert: Partial<UserInvitation> & Pick<UserInvitation, 'firm_id' | 'email' | 'role' | 'invited_by'>;
        Update: Partial<UserInvitation>;
      };
    };
    Views: Record<string, never>;
    Functions: Record<string, never>;
    Enums: {
      risk_level: RiskLevel;
      source_type: SourceType;
    };
  };
}
