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

// Row types for reading from database
export interface UserProfile {
  id: string;
  firm_id: string;
  email: string;
  full_name: string | null;
  role: string;
  created_at: string;
  updated_at: string;
}

export interface Firm {
  id: string;
  name: string;
  created_at: string;
  updated_at: string;
}

export interface Client {
  id: string;
  firm_id: string;
  name: string;
  client_type: 'individual' | 'corporate';
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

// Database schema type for Supabase client
// Using 'any' for table operations to avoid complex generics
// Real projects should use generated types from Supabase CLI
export interface Database {
  public: {
    Tables: {
      user_profiles: {
        Row: UserProfile;
        Insert: Partial<UserProfile> & Pick<UserProfile, 'id' | 'firm_id' | 'email'>;
        Update: Partial<UserProfile>;
      };
      firms: {
        Row: Firm;
        Insert: Partial<Firm> & Pick<Firm, 'name'>;
        Update: Partial<Firm>;
      };
      clients: {
        Row: Client;
        Insert: Partial<Client> & Pick<Client, 'firm_id' | 'name' | 'client_type'>;
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
    };
    Views: Record<string, never>;
    Functions: Record<string, never>;
    Enums: {
      risk_level: RiskLevel;
    };
  };
}
