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
  last_cdd_verified_at?: string | null;
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
  clio_matter_id?: string | null;
  created_at: string;
  updated_at: string;
}

export interface Assessment {
  id: string;
  firm_id: string;
  matter_id: string;
  reference: string;
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

export type EvidenceType = 'companies_house' | 'file_upload' | 'amiqus' | 'manual_record' | 'sow_declaration' | 'sof_declaration';

export interface AssessmentEvidence {
  id: string;
  firm_id: string;
  assessment_id: string;
  action_id: string | null;
  evidence_type: EvidenceType;
  label: string;
  source: string | null;
  data: Json | null;
  file_path: string | null;
  file_name: string | null;
  file_size: number | null;
  notes: string | null;
  verified_at: string | null;
  created_by: string;
  created_at: string;
}

export type ApprovalStatus = 'pending' | 'approved' | 'rejected' | 'withdrawn';

export interface MlroApprovalRequest {
  id: string;
  firm_id: string;
  assessment_id: string;
  requested_by: string;
  requested_at: string;
  status: ApprovalStatus;
  decision_by: string | null;
  decision_at: string | null;
  decision_notes: string | null;
  created_at: string;
}

export interface CddItemProgress {
  id: string;
  firm_id: string;
  assessment_id: string;
  action_id: string;
  completed_at: string | null;
  completed_by: string | null;
  created_at: string;
}

export type IntegrationProvider = 'clio' | 'amiqus';

export interface FirmIntegration {
  id: string;
  firm_id: string;
  provider: IntegrationProvider;
  access_token: string | null;
  refresh_token: string | null;
  token_expires_at: string | null;
  webhook_id: string | null;
  webhook_secret: string | null;
  webhook_expires_at: string | null;
  config: Json;
  connected_at: string | null;
  connected_by: string | null;
  created_at: string;
  updated_at: string;
}

export type AmiqusVerificationStatus = 'pending' | 'in_progress' | 'complete' | 'failed' | 'expired';

export interface AmiqusVerification {
  id: string;
  firm_id: string;
  assessment_id: string;
  action_id: string;
  amiqus_record_id: number | null;
  amiqus_client_id: number | null;
  status: AmiqusVerificationStatus;
  perform_url: string | null;
  verified_at: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
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
        Insert: Partial<Assessment> & Pick<Assessment, 'firm_id' | 'matter_id' | 'reference' | 'input_snapshot' | 'output_snapshot' | 'risk_level' | 'score' | 'created_by'>;
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
      assessment_evidence: {
        Row: AssessmentEvidence;
        Insert: Partial<AssessmentEvidence> & Pick<AssessmentEvidence, 'firm_id' | 'assessment_id' | 'evidence_type' | 'label' | 'created_by'>;
        Update: never;  // Append-only — no updates allowed
      };
      cdd_item_progress: {
        Row: CddItemProgress;
        Insert: Partial<CddItemProgress> & Pick<CddItemProgress, 'firm_id' | 'assessment_id' | 'action_id'>;
        Update: Partial<Pick<CddItemProgress, 'completed_at' | 'completed_by'>>;
      };
      mlro_approval_requests: {
        Row: MlroApprovalRequest;
        Insert: Partial<MlroApprovalRequest> & Pick<MlroApprovalRequest, 'firm_id' | 'assessment_id' | 'requested_by'>;
        Update: Partial<Pick<MlroApprovalRequest, 'status' | 'decision_by' | 'decision_at' | 'decision_notes'>>;
      };
      firm_integrations: {
        Row: FirmIntegration;
        Insert: Partial<FirmIntegration> & Pick<FirmIntegration, 'firm_id' | 'provider'>;
        Update: Partial<FirmIntegration>;
      };
      amiqus_verifications: {
        Row: AmiqusVerification;
        Insert: Partial<AmiqusVerification> & Pick<AmiqusVerification, 'firm_id' | 'assessment_id' | 'action_id'>;
        Update: Partial<Pick<AmiqusVerification, 'status' | 'verified_at'>>;
      };
    };
    Views: Record<string, never>;
    Functions: {
      match_assistant_sources: {
        Args: {
          query_embedding: string;
          match_threshold?: number;
          match_count?: number;
        };
        Returns: Array<{
          id: string;
          firm_id: string;
          source_type: string;
          source_name: string;
          section_ref: string;
          topics: string[];
          content: string;
          effective_date: string | null;
          created_at: string;
          updated_at: string;
          similarity: number;
        }>;
      };
      verify_clio_webhook: {
        Args: { p_signature: string; p_body: string };
        Returns: Array<{ firm_id: string; access_token: string }>;
      };
      process_clio_webhook: {
        Args: {
          p_firm_id: string;
          p_clio_matter_id: string;
          p_matter_display_number: string;
          p_matter_description: string;
          p_clio_contact_id: string;
          p_contact_name: string;
          p_contact_type: string;
          p_user_id: string;
        };
        Returns: Json;
      };
      verify_amiqus_webhook: {
        Args: { p_signature: string; p_body: string };
        Returns: Array<{ firm_id: string }>;
      };
      process_amiqus_webhook: {
        Args: {
          p_firm_id: string;
          p_amiqus_record_id: number;
          p_status: string;
          p_verified_at?: string;
        };
        Returns: Json;
      };
    };
    Enums: {
      risk_level: RiskLevel;
      source_type: SourceType;
      evidence_type: EvidenceType;
    };
  };
}
