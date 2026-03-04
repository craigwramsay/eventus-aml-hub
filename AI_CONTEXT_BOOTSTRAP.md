# Eventus AML Compliance Hub -- AI Context Bootstrap Document

> **Purpose:** Paste this document into a new AI conversation to fully restore technical, architectural, regulatory and strategic context for this project. Treat as source of truth.

---

## 1. Project Overview

Eventus AML Compliance Hub is a multi-tenant web application for UK law firms to conduct client and matter-level AML risk assessments. It combines a **deterministic rules engine** (pure TypeScript, config-driven, auditable) with a **strictly limited AI assistant** (explanatory only, source-grounded, no access to client data).

The system is designed around regulatory defensibility: every assessment is reproducible from stored snapshots, every action is audit-logged, and firm data is isolated at the database level via Row-Level Security.

---

## 2. Core Objectives

- Automate client/matter-level AML risk scoring per the firm's internal risk model.
- Produce formal, deterministic risk determination documents from stored snapshots.
- Map risk levels to mandatory CDD/EDD/SoW/SoF/monitoring actions per the firm's CDD ruleset.
- Provide an AI assistant that answers regulatory questions **only** from curated source materials.
- Enforce complete firm-level data isolation.
- Maintain a full audit trail for regulatory inspection.

---

## 3. Regulatory Context

| Item | Detail |
|------|--------|
| **Jurisdiction** | Scotland and England & Wales (configurable per firm) |
| **Regulated sector** | Legal services (Law Society of Scotland / SRA-regulated law firms) |
| **Primary legislation** | Money Laundering, Terrorist Financing and Transfer of Funds (Information on the Payer) Regulations 2017 (MLR 2017) |
| **Secondary legislation** | Proceeds of Crime Act 2002 (POCA) |
| **Sector guidance** | Legal Sector Affinity Group (LSAG) AML Guidance 2025 |
| **FATF lists** | FATF Black List, FATF Grey List (High-Risk Third Countries) |
| **Internal policies** | Eventus Practice-Wide Risk Assessment (PWRA), AML Policy, Practice & Compliance Procedures (PCPs) |
| **Risk scoring model** | Eventus Internal Risk Scoring Model v3.8 (PCP S4) |
| **CDD ruleset** | Derived from PCPs, MLR 2017, LSAG 2025 (v2, with new-client SoW at LOW risk) |
| **Assessment form** | Client & Matter Level Risk Assessment (CMLRA) -- individual and corporate variants |

Key regulatory requirements enforced by the system:
- Risk-based approach to CDD (MLR 2017 reg. 28).
- Enhanced due diligence for high-risk situations (MLR 2017 regs. 33, 35).
- EDD triggers from PCP s.20 (TCSP, cross-border, third-party funder) — these inject EDD actions without changing the risk level.
- Source of wealth and source of funds verification where required. New clients at LOW risk require SoW form (PCP s.11).
- Ongoing monitoring obligations.
- Automatic HIGH risk escalation for specific triggers (PEP status, receipt of funds into client account — per PWRA §2.4, LSAG §6.2.3).
- Entity type exclusion warnings (trusts, charities, overseas entities, etc.) with MLRO escalation.

---

## 4. Tech Stack

| Layer | Technology |
|-------|------------|
| Framework | Next.js 16.1.6 (App Router, Server Components by default) |
| React | 19.2.3 |
| Language | TypeScript 5 (strict mode) |
| Database | Supabase (PostgreSQL + Auth + RLS) |
| Styling | CSS Modules + CSS Variables (dark mode via `prefers-color-scheme`) |
| Testing | Vitest 4.0.18 |
| Linting | ESLint 9 with Next.js Core Web Vitals |
| LLM clients | OpenAI SDK, Anthropic SDK (pluggable via env var) |
| Embeddings | OpenAI text-embedding-3-small via raw fetch (1536 dimensions) |
| Vector search | pgvector (Supabase extension) with HNSW index |
| Scripts | tsx for TypeScript script execution |
| Fonts | Geist Sans + Geist Mono (next/font) |

Key commands:
```bash
npm run dev          # Development server (localhost:3000)
npm run build        # Production build
npm run lint         # ESLint
npm test             # Vitest (single run)
npm run test:watch   # Vitest (watch mode)
npm run ingest:excerpts       # Ingest source excerpts to DB
npm run ingest:excerpts:dry   # Dry run of excerpt ingest
```

---

## 5. Folder Structure

```
eventus-aml-hub/
├── .github/workflows/ci.yml         # CI/CD pipeline (lint, typecheck, test, build, Docker)
├── Dockerfile                        # Multi-stage production Docker build
├── docker-compose.yml                # Local Docker development
├── scripts/                          # CLI tools (excerpt parser, ingest, extract-pdf-text)
├── sources/                          # Raw source documents (originals, NOT imported by code)
│   ├── eventus/
│   │   ├── excerpts/                 # Internal policy excerpts (YAML frontmatter + content)
│   │   ├── forms/                    # Original CMLRA form exports (reference only)
│   │   ├── rules/                    # Original risk model + CDD ruleset documents (.docx/.txt)
│   │   ├── *.docx / *.txt           # PWRA, AML Policy source documents
│   └── sources_external/            # Legislation, guidance PDFs (MLR 2017, LSAG 2025, FATF lists)
│   │   └── extracted/               # Raw verbatim text extracted from PDFs (35 files)
│   └── external/
│       └── excerpts/                 # Curated regulatory excerpts for assistant ingestion (47 files, verbatim)
├── supabase/migrations/              # SQL migrations for schema changes
├── src/
│   ├── config/
│   │   ├── platform/                 # Platform-wide regulatory baseline
│   │   │   └── regulatory_baseline_v1.json  # Mandatory scoring factors, CDD actions, EDD triggers, staleness limits
│   │   └── eventus/                  # Runtime config files (imported by rules engine, used as defaults)
│   │       ├── risk_scoring_v3_8.json  # Risk scoring model (thresholds, factors, EDD triggers)
│   │       ├── cdd_ruleset.json        # CDD/EDD/SoW/SoF action mappings by risk level
│   │       ├── cdd_staleness.json        # CDD validity staleness thresholds by risk level
│   │       ├── forms/
│   │       │   ├── CMLRA_individual.json  # Individual client form config
│   │       │   ├── CMLRA_corporate.json   # Corporate client form config
│   │       │   ├── SoW_individual.json    # Source of Wealth form (individual)
│   │       │   ├── SoW_corporate.json     # Source of Wealth form (corporate)
│   │       │   └── SoF.json              # Source of Funds form
│   │       └── rules/
│   │           └── sector_mapping.json    # Sector → risk category mapping
│   ├── app/
│   │   ├── layout.tsx                # Root layout (env validation + AuthenticatedAssistant)
│   │   ├── page.tsx                  # Landing page
│   │   ├── error.tsx                 # Global error boundary
│   │   ├── not-found.tsx             # 404 page
│   │   ├── (public)/                 # Route group for unauthenticated pages
│   │   │   ├── layout.tsx            # Public layout (centered, no shell)
│   │   │   ├── login/                # Authentication
│   │   │   ├── auth/callback/        # OAuth/magic link callback
│   │   │   ├── auth/confirm/         # Email confirmation route
│   │   │   ├── set-password/         # Password setup page
│   │   │   ├── mfa/setup/            # TOTP MFA enrolment (QR code)
│   │   │   ├── mfa/verify/           # TOTP MFA challenge
│   │   │   └── invite/accept/        # Invitation acceptance + password setup
│   │   ├── (authenticated)/          # Route group for authenticated pages (app shell)
│   │   │   ├── layout.tsx            # Authenticated layout (Sidebar + Topbar shell, auth redirect)
│   │   │   ├── dashboard/            # Post-login dashboard (role-aware)
│   │   │   │   ├── page.tsx          # Role-differentiated server-side rendering
│   │   │   │   └── components/       # SolicitorDashboard, MlroDashboard, AdminDashboard, StatCard, RiskDistribution, ActivityFeed, PendingApprovals, CddExpiryWarnings
│   │   │   ├── admin/                # Platform admin pages
│   │   │   │   ├── configs/          # Firm config status list + per-firm detail view
│   │   │   │   └── baseline/         # Regulatory baseline viewer
│   │   │   ├── clients/              # Client CRUD (/clients, /clients/new, /clients/[id])
│   │   │   ├── matters/              # Matter CRUD (/matters, /matters/new, /matters/[id])
│   │   │   ├── assessments/
│   │   │   │   ├── AssessmentsList.tsx  # List with sortable table + search + pill filters
│   │   │   │   ├── new/              # Assessment form (config-driven, dynamic)
│   │   │   │   └── [id]/
│   │   │   │       ├── page.tsx      # Assessment result view (EDD triggers, warnings, role-gated finalise)
│   │   │   │       ├── FinaliseButton.tsx
│   │   │   │       ├── DeleteAssessmentButton.tsx
│   │   │   │       ├── CDDStatusBanner.tsx   # CDD staleness banner
│   │   │   │       ├── SowSofForm.tsx        # SoW/SoF declaration form
│   │   │   │       └── determination/  # Formal determination document view
│   │   │   ├── settings/
│   │   │   │   ├── integrations/      # Integration settings (Clio/Amiqus connect/disconnect)
│   │   │   │   └── calibration/       # Per-firm config calibration
│   │   │   │       ├── page.tsx       # Config overview dashboard (status + version history)
│   │   │   │       ├── wizard/        # 7-step calibration wizard (risk appetite, scoring weights, automatic outcomes, CDD actions, sector mapping, CDD staleness, review)
│   │   │   │       └── documents/     # PWRA/PCP/AML policy document upload
│   │   │   └── users/                # User management (admin-only)
│   │   │       ├── page.tsx          # User list + pending invitations
│   │   │       ├── invite/           # Invite user form
│   │   │       └── [id]/             # User detail / role edit / deactivate
│   │   ├── actions/                  # Server Actions (assessments, clients, matters, users, firms, evidence, progress, approvals, integrations, amiqus, config, dashboard)
│   │   └── api/
│   │       ├── assistant/route.ts    # POST endpoint for AI assistant (rate-limited)
│   │       ├── admin/backfill-embeddings/route.ts  # POST trigger for embedding backfill
│   │       ├── health/route.ts       # Health check endpoint
│   │       ├── integrations/clio/connect/route.ts   # GET: initiate Clio OAuth flow
│   │       ├── integrations/clio/callback/route.ts  # GET: handle Clio OAuth callback
│   │       ├── webhooks/clio/route.ts    # POST: receive Clio webhooks (HMAC verified)
│   │       └── webhooks/amiqus/route.ts  # POST: receive Amiqus webhooks (HMAC verified)
│   ├── data/
│   │   └── countries.ts              # Standard country list (195 countries) for multi-select
│   ├── components/
│   │   ├── assistant/                # AssistantPanel, GlobalAssistantButton, QuestionHelperButton, AuthenticatedAssistant
│   │   ├── forms/                    # Shared form components (CountryMultiSelect)
│   │   ├── shell/                    # App shell components (authenticated layout)
│   │   │   ├── Sidebar.tsx           # Collapsible navigation sidebar
│   │   │   ├── SidebarContext.tsx     # Sidebar open/collapsed state provider
│   │   │   ├── Topbar.tsx            # Top bar with hamburger toggle
│   │   │   ├── LogoutButton.tsx      # Logout button (client component)
│   │   │   └── FirmSwitcher.tsx      # Platform admin firm switcher dropdown
│   │   └── tables/                   # Shared table components
│   │       ├── SortableTable.tsx     # Generic sortable/filterable table (client component)
│   │       └── sortableTable.module.css
│   ├── lib/
│   │   ├── auth/                     # RBAC: roles, permission checks (solicitor/mlro/admin/platform_admin)
│   │   ├── clio/                     # Clio API client (OAuth, matters, contacts, webhooks)
│   │   ├── amiqus/                   # Amiqus API client (identity verification, webhooks)
│   │   ├── rules-engine/             # Deterministic AML scoring engine
│   │   │   ├── types.ts             # All engine types (including EDDTriggerResult, AssessmentWarning)
│   │   │   ├── baseline-types.ts    # RegulatoryBaseline interface hierarchy (validation ruleset)
│   │   │   ├── config-loader.ts     # JSON config importer (singleton cache, static defaults)
│   │   │   ├── config-loader-server.ts  # DB-backed config loader (firm config → falls back to static)
│   │   │   ├── config-validator.ts  # Validate firm config against regulatory baseline
│   │   │   ├── scorer.ts            # calculateScore() + checkEDDTriggers()
│   │   │   ├── requirements.ts      # getMandatoryActions() (with entity exclusions, new-client SoW, evidence types)
│   │   │   └── index.ts             # runAssessment() entry point
│   │   ├── determination/            # Consolidated determination renderer
│   │   │   ├── types.ts             # Snapshot types (InputSnapshot, OutputSnapshot, etc.)
│   │   │   ├── renderDetermination.ts  # Deterministic renderer (EDD triggers, warnings, evidence types, jurisdiction)
│   │   │   ├── policy-references.ts    # Policy ref mappings (risk level, category, outcome, EDD trigger)
│   │   │   ├── jurisdiction.ts         # Scotland / England & Wales config
│   │   │   └── index.ts
│   │   ├── assistant/                # AI assistant orchestration (prompt, validation, sources)
│   │   ├── embeddings/               # OpenAI embedding client (text-embedding-3-small)
│   │   ├── llm/                      # Pluggable LLM client (OpenAI + Anthropic)
│   │   ├── security/                 # Rate limiter, password policy
│   │   ├── config/                   # Environment variable validation
│   │   └── supabase/                 # DB client, server client, types
│   └── middleware.ts                 # Auth + session timeout + MFA enforcement
├── CLAUDE.md                         # Claude Code project instructions
└── vitest.config.ts
```

---

## 6. Database Schema

### Tables

| Table | Purpose | Key columns |
|-------|---------|-------------|
| `firms` | Law firm entities | `id`, `name`, `jurisdiction` (`scotland` \| `england_and_wales`), `config_status` (`unconfigured` \| `draft` \| `active`), `active_config_version_id` |
| `user_profiles` | Users scoped to firm | `user_id` (PK, = auth.uid), `firm_id`, `email`, `full_name`, `role` (`solicitor` \| `mlro` \| `admin`), `created_at` |
| `user_invitations` | Pending user invites | `id`, `firm_id`, `email`, `role`, `invited_by`, `accepted_at`, `created_at` |
| `clients` | Clients of the firm | `id`, `firm_id`, `name`, `entity_type`, `client_type`, `clio_contact_id`, `last_cdd_verified_at` |
| `matters` | Legal matters | `id`, `firm_id`, `client_id`, `reference`, `description`, `status`, `clio_matter_id` |
| `assessments` | Risk assessments | `id`, `firm_id`, `matter_id`, `reference` (unique, `A-XXXXX-YYYY`), `input_snapshot` (JSON), `output_snapshot` (JSON), `risk_level`, `score`, `config_version_id`, `created_by`, `finalised_at`, `finalised_by` |
| `assessment_evidence` | Verification evidence | `id`, `firm_id`, `assessment_id`, `action_id`, `evidence_type`, `label`, `source`, `data`, `file_path`, `verified_at`, `created_by` |
| `cdd_item_progress` | CDD checklist completion tracking | `id`, `firm_id`, `assessment_id`, `action_id`, `completed_at`, `completed_by` |
| `mlro_approval_requests` | MLRO approval workflow | `id`, `firm_id`, `assessment_id`, `requested_by`, `status` (pending/approved/rejected/withdrawn), `decision_by`, `decision_notes` |
| `firm_integrations` | OAuth tokens + webhook config per provider | `id`, `firm_id`, `provider` (clio/amiqus), `access_token`, `refresh_token`, `webhook_id`, `webhook_secret`, `webhook_expires_at`, `config` |
| `amiqus_verifications` | Amiqus ID verification tracking | `id`, `firm_id`, `assessment_id`, `action_id`, `amiqus_record_id`, `status`, `perform_url`, `verified_at` |
| `audit_events` | Complete activity log | `id`, `firm_id`, `entity_type`, `entity_id`, `action`, `metadata` (JSON), `created_by` |
| `regulatory_baseline` | Platform-wide regulatory floor | `id`, `version_number` (unique), `status` (active/superseded), `scoring`, `cdd`, `sector_mapping`, `staleness` (all jsonb), `created_by` |
| `firm_config_versions` | Per-firm engine config (immutable when active) | `id`, `firm_id`, `version_number`, `status` (draft/active/superseded), `risk_scoring`, `cdd_ruleset`, `sector_mapping`, `cdd_staleness` (all jsonb), `created_by`, `activated_by`, `activated_at` |
| `firm_config_gap_acknowledgements` | MLRO rationale for baseline deviations | `id`, `config_version_id`, `gap_code`, `baseline_requirement`, `firm_value`, `rationale` (min 20 chars), `acknowledged_by` |
| `firm_documents` | Firm policy uploads (PWRA/PCP/AML policy) | `id`, `firm_id`, `document_type` (pwra/pcp/aml_policy/other), `file_name`, `file_path`, `description`, `config_version_id` |
| `assistant_sources` | Curated knowledge base | `id`, `firm_id`, `source_type` (external/internal), `source_name`, `section_ref`, `topics` (text[]), `content`, `effective_date`, `embedding` (vector(1536), nullable) |

### Functions (RPC)

| Function | Purpose | Notes |
|----------|---------|-------|
| `match_assistant_sources(query_embedding, match_threshold, match_count)` | Vector similarity search for assistant sources | `SECURITY INVOKER` — RLS enforces firm isolation. Returns sources + similarity score. |
| `verify_clio_webhook(p_signature, p_body)` | Verify Clio webhook HMAC-SHA256 signature | `SECURITY DEFINER` — checks signature against stored secrets, returns `firm_id` + `access_token` on match. |
| `process_clio_webhook(...)` | Create client + matter from Clio data | `SECURITY DEFINER` — finds/creates client by `clio_contact_id`, creates matter by `clio_matter_id`, audit logs. |
| `verify_amiqus_webhook(p_signature, p_body)` | Verify Amiqus webhook base64 HMAC-SHA256 signature | `SECURITY DEFINER` — returns `firm_id` on match. |
| `process_amiqus_webhook(p_firm_id, p_amiqus_record_id, p_status, p_verified_at)` | Update verification status, create evidence on completion | `SECURITY DEFINER` — updates `amiqus_verifications`, creates `assessment_evidence`, updates `clients.last_cdd_verified_at`. |

### Relationships

```
Firm ──< UserProfile
Firm ──< UserInvitation
Firm ──< Client ──< Matter ──< Assessment ──< AssessmentEvidence
Firm ──< AuditEvent                            ──< CddItemProgress
Firm ──< AssistantSource                       ──< MlroApprovalRequest
Firm ──< FirmIntegration                       ──< AmiqusVerification
Firm ──< FirmConfigVersion ──< FirmConfigGapAcknowledgement
Firm ──< FirmDocument
RegulatoryBaseline (platform-wide, single active row)
```

### Critical design notes

- **All tables have `firm_id`**. RLS policies enforce firm isolation at the PostgreSQL level.
- **`assessments.input_snapshot`** stores a complete copy of form answers at submission time, plus the firm's `jurisdiction` at assessment creation. This is the reproducibility guarantee.
- **`assessments.output_snapshot`** stores the complete engine output (score, riskLevel, riskFactors, mandatoryActions, rationale, automaticOutcome, eddTriggers, warnings, timestamp). MandatoryActions may include `evidenceTypes` arrays.
- **`assessments.reference`** — human-readable identifier (pattern `A-XXXXX-YYYY`, like matters have `M-XXXXX-YYYY`). Generated at creation time, unique, NOT NULL.
- **`assessments.finalised_at`** -- when non-null, the assessment is immutable. No further writes permitted.
- **`audit_events`** logs action type and metadata but **never logs assistant question content** (privacy).
- **No service role key** is used at runtime. All Supabase operations use the authenticated user session.

---

## 7. Deterministic Rules Engine

**Location:** `src/lib/rules-engine/`

### Architecture

```
Form Answers (JSON)
       │
       ▼
┌─────────────────┐    ┌──────────────────────────┐
│  config-loader   │───▶│ risk_scoring_v3_8.json    │
│                  │───▶│ cdd_ruleset.json          │
│                  │───▶│ CMLRA_individual.json      │
│                  │───▶│ CMLRA_corporate.json       │
│                  │───▶│ sector_mapping.json         │
└─────────────────┘
       │
       ▼
┌─────────────────┐
│    scorer.ts     │  calculateScore() → { score, riskLevel, riskFactors, automaticOutcome }
│                  │  checkEDDTriggers() → EDDTriggerResult[]
└─────────────────┘
       │
       ▼
┌─────────────────┐
│ requirements.ts  │  getMandatoryActions() → { actions: MandatoryAction[], warnings: AssessmentWarning[] }
│                  │  (entity exclusions, new-client SoW, EDD trigger injection, evidence types)
└─────────────────┘
       │
       ▼
┌─────────────────┐
│    index.ts      │  runAssessment(input) → AssessmentOutput
└─────────────────┘
```

### Entry point

```typescript
runAssessment({ clientType: 'individual' | 'corporate', formAnswers: Record<string, string | string[]> })
  → AssessmentOutput {
      score, riskLevel, automaticOutcome, riskFactors, rationale,
      mandatoryActions,  // MandatoryAction[] (may include evidenceTypes: string[])
      eddTriggers,       // EDDTriggerResult[] — PCP s.20 triggers (do NOT change risk level)
      warnings,          // AssessmentWarning[] — entity exclusions, MLRO escalation
      timestamp
    }
```

### Non-negotiable properties

1. **Zero hardcoded rules.** All scoring factors, thresholds, outcomes, EDD triggers, and CDD actions live in JSON config files.
2. **Deterministic.** Identical input + identical config = identical output. Always.
3. **No LLM involvement.** The rules engine never calls any AI service.
4. **Config-versioned.** The scoring model has a version (`v3.8`) and version date. Config changes are tracked.
5. **Automatic outcomes.** Certain answers (PEP = Yes, client account funds = Yes) trigger automatic HIGH risk with mandatory EDD, regardless of score.
6. **Threshold-based risk levels.** LOW: 0-4, MEDIUM: 5-8, HIGH: 9+.
7. **Snapshot pattern.** Both `input_snapshot` (including jurisdiction) and `output_snapshot` are stored in the assessment record at creation time.

### Key engine concepts

**EDD Triggers (PCP s.20):** Config-driven triggers (TCSP activity, cross-border funds, third-party funder) that inject EDD actions into the mandatory actions list without changing the risk level. A LOW-risk assessment with an EDD trigger stays LOW but gains EDD actions.

**Automatic HIGH Outcomes:** Two triggers force automatic HIGH risk regardless of score: (1) PEP status = Yes (per MLR reg. 35, PCP §15), and (2) receipt of funds into Eventus' client account = Yes (per PWRA §2.4, LSAG §6.2.3, PCP §20). Client account involvement is also an EDD trigger, so it both escalates the risk level AND injects EDD actions.

**Entity Exclusions:** When a corporate entity type falls outside the standard CDD ruleset (trusts, charities, unincorporated associations, overseas entities, etc.), the engine produces warnings requiring MLRO escalation. The engine still runs and produces a full assessment — warnings are advisory, not blockers.

**New Client SoW at LOW Risk (PCP s.11):** All new clients at LOW risk require a Source of Wealth form (required) and supporting evidence (recommended). At MEDIUM+ the full SoW requirements apply as before.

**Evidence Types:** The CDD ruleset specifies evidence types for certain actions (e.g., "payslips or tax returns", "bank statements"). These are propagated through to `MandatoryAction.evidenceTypes` and rendered in the determination document.

**Delivery Channel (LSAG 5.6.4):** Scored risk factor (+1 for remote/non-face-to-face or intermediary introduction, 0 for face-to-face) in both individual and corporate assessments.

**Documented Intentional Omissions:**
- SoF/SoW inconsistencies (PCP s.20) — human judgment during review, not detectable from the initial CMLRA form
- AML-supervised score reduction — SDD requires MLRO approval and is "rarely" used per policy; automating it would contradict policy intent
- Individual occupation/sector risk — subjective classification would introduce inconsistency; corporate sector risk is scored via the authoritative `sector_mapping.json`

### Determination rendering

**Location:** `src/lib/determination/`

Single consolidated renderer that produces formal risk determination documents from stored snapshots. Includes:
- Policy references (PCP, MLR 2017, LSAG 2025 section numbers) linked to risk factors, mandatory actions, and EDD triggers
- Jurisdiction-aware regulator details (Law Society of Scotland / SRA) — read from `input_snapshot.jurisdiction` (stored at assessment creation)
- Scoring breakdown table showing every scoring factor with its answer and score (not just triggered factors)
- Evidence types shown as sub-lists under applicable mandatory actions
- EDD Triggers section (when present) — listed after CDD REQUIREMENTS, before RISK FACTORS
- Warnings section (when present) — shown after CDD REQUIREMENTS with MLRO escalation messaging
- Verification evidence section (when present) — Companies House reports, file uploads, manual records
- `[Recommended]` label on non-mandatory actions (e.g., evidence at LOW risk)

Standard sections: heading, assessment details, risk determination, scoring breakdown, CDD requirements, [EDD triggers], [warnings], [verification evidence], risk factors, policy references, risk appetite

**Deterministic**: no LLM, no recomputation, no conditional language ("if", "consider", "may" are prohibited in output). Same input always produces identical text.

---

## 8. Assistant AI Design

**Location:** `src/lib/assistant/` + `src/app/api/assistant/route.ts`

### Purpose

Explanatory assistant that answers AML regulatory/policy questions. It does **not** perform assessments, access client data, or generate formal documents.

### Architecture

```
User Question
      │
      ▼
┌──────────────┐
│ validation.ts │  Reject if contains client data (PII patterns, NI numbers, postcodes, DOBs, etc.)
└──────────────┘
      │
      ▼
┌──────────────────┐
│    sources.ts     │  1. Try vector similarity search (pgvector + OpenAI embeddings)
│                   │  2. Fall back to keyword → topic mapping if vector unavailable or empty
│                   │  3. Final fallback: retrieve all sources
└──────────────────┘
      │
      ▼
┌──────────────┐
│   prompt.ts   │  Build system prompt with firm name, strict limitations, and provided materials
└──────────────┘
      │
      ▼
┌──────────────┐
│  service.ts   │  Call LLM via pluggable client (temperature: 0.2)
└──────────────┘
      │
      ▼
Answer + Citations
```

### Strict limitations (enforced in system prompt)

The assistant MUST NOT:
- Perform risk scoring or calculations
- Make risk determinations or recommendations
- Generate file notes, reports, or formal documents
- Access, reference, or process any client data
- Access matters, assessments, or form answers
- Rely on general knowledge outside provided materials
- Make assumptions about AML requirements not in the materials

If the answer is not in the provided materials, the response must be exactly:
`"That information is not contained in the provided materials."`

### Input validation

`validation.ts` rejects requests containing:
- Client data field names (name, DOB, address, NI number, passport, bank account, etc.)
- SoW/SoF only when followed by actual data values (e.g., `SoF: £50,000`) -- standalone regulatory terms like "What does SoF mean?" are allowed
- Personal data value patterns (UK postcodes, NI numbers, date-of-birth formats, currency amounts)
- Empty or excessively long questions (max 2000 chars)

### Source retrieval

**Primary: Vector similarity search** — embeds the user's question via OpenAI `text-embedding-3-small`, then calls `match_assistant_sources` RPC (pgvector cosine similarity, threshold 0.5, HNSW index). Graceful degradation: if `OPENAI_API_KEY` is not set or vector search returns empty, falls back to keyword-based topic matching (`KEYWORD_TOPICS` → `overlaps` query on `assistant_sources.topics[]`). Final fallback: retrieve all sources.

**Embedding generation:** New sources automatically get embeddings on create/bulk-create (fail-safe — source is still created if embedding fails). Admin `backfillEmbeddings()` action generates embeddings for existing sources missing them.

### UI integration

The `GlobalAssistantButton` (floating "?" button, bottom-right) is rendered on all pages via `AuthenticatedAssistant` in the root layout. It only appears when the user has an active session. Clicking opens the `AssistantPanel` sliding chat interface. `QuestionHelperButton` provides contextual help on individual assessment form fields.

---

## 9. Security Model

| Control | Implementation |
|---------|---------------|
| **Authentication** | Supabase Auth (email/password) |
| **MFA** | TOTP-based via Supabase Auth (`src/app/mfa/`). Middleware enforces AAL2 for all authenticated routes. |
| **Session management** | Cookie-based via `@supabase/ssr` with 30-minute idle timeout (`aml_last_activity` cookie in middleware) |
| **RBAC** | Four roles: `solicitor`, `mlro`, `admin`, `platform_admin`. Permission checks in `src/lib/auth/roles.ts`. Enforced in server actions and UI. `platform_admin` is a superuser that can switch between firms. |
| **Route protection** | Next.js middleware redirects unauthenticated users to `/login`, enforces MFA, manages session timeout |
| **HTTP security headers** | HSTS, CSP, X-Frame-Options (DENY), X-Content-Type-Options, Referrer-Policy, Permissions-Policy — configured in `next.config.ts` |
| **Rate limiting** | In-memory sliding window (`src/lib/security/rate-limiter.ts`): login 5/15min, assistant 20/min, server actions 60/min |
| **Password policy** | 12+ chars, mixed case, digit, special char, common password blocklist (`src/lib/security/password-policy.ts`) |
| **Data isolation** | PostgreSQL RLS policies on all tables, scoped by `firm_id` |
| **No service role key** | All server actions use the authenticated user's session. Webhook endpoints use `SECURITY DEFINER` RPC functions for DB writes (HMAC verified). |
| **Webhook HMAC verification** | Clio: hex HMAC-SHA256 (`X-Hook-Signature`). Amiqus: base64 HMAC-SHA256 (`X-AQID-Signature`). Verified via DB RPC against stored per-firm secrets. |
| **Assessment immutability** | `finalised_at` timestamp locks the record; `checkAssessmentModifiable()` guard |
| **No PII to LLM** | `validation.ts` pattern-matches and rejects client data before it reaches the LLM |
| **Audit trail** | All significant actions logged to `audit_events` (assistant questions logged by length only, not content). Failed logins also logged. |
| **Snapshot integrity** | `input_snapshot` and `output_snapshot` stored at creation; determination renders from snapshots, never recomputes |
| **LLM isolation** | LLM only receives curated source excerpts and the user's question; no database access, no client data |
| **Env validation** | `src/lib/config/env.ts` validates required environment variables at startup |

---

## 10. Current Feature Status

### Working

- [x] Authentication (login/logout, session refresh, middleware protection)
- [x] MFA (TOTP enrolment + verification, middleware-enforced AAL2)
- [x] Session idle timeout (30 minutes)
- [x] Role-based access control (solicitor/mlro/admin/platform_admin, server-side enforcement)
- [x] Platform admin role (superuser: can view all firms, switch active firm via FirmSwitcher)
- [x] User management (admin invite flow, role editing, deactivation)
- [x] App shell with sidebar navigation (collapsible Sidebar, Topbar with hamburger toggle)
- [x] Route groups: `(authenticated)` with app shell layout, `(public)` for login/MFA/invite flows
- [x] Dashboard (role-based analytics — solicitor/MLRO/admin views with summary metrics, risk distribution, activity feed, pending approvals, CDD expiry warnings)
- [x] Client CRUD (list, create, view with matters, delete — MLRO/platform_admin)
- [x] Matter CRUD (list, create, view with assessments, delete with cascade — MLRO/platform_admin)
- [x] Assessment form (config-driven, dynamic fields, conditional visibility, individual + corporate, date picker for DOB, country multi-select with typeahead)
- [x] Assessment references (human-readable `A-XXXXX-YYYY` pattern, unique, shown in lists and detail headers)
- [x] Deterministic rules engine (scoring, risk levels, automatic outcomes, mandatory actions, EDD triggers, entity exclusions, evidence types)
- [x] EDD trigger detection (PCP s.20: TCSP, cross-border, third-party funder)
- [x] Automatic HIGH for client account funds (PWRA §2.4, LSAG §6.2.3 — receipt of funds into client account triggers automatic HIGH + EDD)
- [x] Entity exclusion warnings (trusts, unincorporated associations → MLRO escalation)
- [x] New client SoW at LOW risk (form required, evidence recommended)
- [x] Evidence types propagated from CDD config to mandatory actions
- [x] Delivery channel scoring factor (LSAG 5.6.4)
- [x] Assessment result view (score, risk level, contributing factors, mandatory actions, EDD triggers, warnings)
- [x] Determination rendering (consolidated renderer with policy references, jurisdiction, scoring breakdown, EDD triggers, warnings, verification evidence)
- [x] Assessment finalisation (immutable lock with audit event, role-gated)
- [x] Assessment deletion (MLRO/platform_admin, cascades evidence + progress + storage files)
- [x] Determination copy-to-clipboard
- [x] Determination back-to-assessment navigation
- [x] AI assistant panel (question input, source-grounded answers, citations, jurisdiction-aware)
- [x] AI assistant floating button (authenticated-only, all pages via root layout)
- [x] Per-question helper buttons on assessment form
- [x] Assistant input validation (PII rejection, refined SoW/SoF patterns)
- [x] Vector/semantic search for assistant sources (pgvector + OpenAI embeddings, keyword fallback)
- [x] Embedding backfill for existing sources (admin API endpoint)
- [x] Pluggable LLM client (OpenAI + Anthropic)
- [x] Source excerpt ingestion pipeline (YAML frontmatter parser, Supabase insert)
- [x] External source library (47 verbatim excerpts: MLR 2017, POCA 2002, LSAG 2025, FATF lists, NRA 2025, Scottish Sectoral Risk, Rule B9)
- [x] Audit event logging (including failed login attempts)
- [x] Multi-tenant firm isolation (RLS)
- [x] Multi-jurisdiction support (Scotland / England & Wales, per-firm setting)
- [x] HTTP security headers (HSTS, CSP, X-Frame-Options, etc.)
- [x] Rate limiting (login, assistant, server actions)
- [x] Password policy enforcement
- [x] Environment variable validation
- [x] Deployment infrastructure (Dockerfile, docker-compose, CI/CD, health check)
- [x] Error boundaries (error.tsx, not-found.tsx)
- [x] Assessment re-run workflow (re-run button, pre-populate from previous answers, assessment history on matter page)
- [x] PDF export of completed assessment page (browser print with `@media print` styles; auto-expands CH cards, declarations, Assessment Detail for print; hides interactive buttons; preserves green completed styling)
- [x] Sortable tables on all list pages (click column headers for asc/desc, per-column dropdown filters for Risk level)
- [x] Client/matter/assessment search and filtering (text search + type/status pill filters)
- [x] Entity deletion with RLS policies (clients, matters, assessments, evidence, CDD progress — MLRO/admin/platform_admin)
- [x] Interactive CDD checklist with per-item evidence upload
- [x] Companies House integration (company lookup card on corporate assessments, registered number extracted from form answers when not on client record)
- [x] Monitoring statement on assessment detail page
- [x] Amiqus link button (external link to `https://id.amiqus.co/`, opens new tab, teal branding)
- [x] Verification date recording on identity evidence (`verified_at` date column, UI date inputs on upload/manual forms for identity actions, green badge display)
- [x] CDD validity tracking (`clients.last_cdd_verified_at`, risk-based staleness thresholds in `cdd_staleness.json`, CDDStatusBanner component on assessment page, last CDD date on client detail page, universal 2-year longstop with finalisation guard)
- [x] Confirmation-only CDD actions (`confirm_matter_purpose`, `verify_consistency`, `confirm_transparency`, `confirm_bo` show single "Confirm" button instead of Upload/Add Record)
- [x] Verification note formatting (numbered items rendered on separate lines with authority citation)
- [x] MLRO approval workflow (request/approve/reject/withdraw with role-gated UI, dashboard pending list for MLROs)
- [x] SoW/SoF declaration forms (config-driven, upsert pattern, expandable evidence cards)
- [x] Companies House PSC lookups (persons with significant control, expanded card display)
- [x] CDD reference page (browsable CDD ruleset at `/assessments/cdd-reference`)
- [x] Clio API integration (OAuth connect/callback, matter.create webhook, auto-sync clients+matters)
- [x] Amiqus API integration (initiate verification from CDD checklist, webhook-driven status updates, auto-evidence on completion)
- [x] Integration settings page (`/settings/integrations` — connect/disconnect Clio, view Amiqus status, webhook health)
- [x] Webhook HMAC verification via SECURITY DEFINER RPCs (no service role key in Next.js runtime)
- [x] Graceful degradation when integration env vars absent (settings shows "not configured", Amiqus falls back to static link)
- [x] Fix stale conditional field answers (gate question toggle now clears dependent field answers to prevent incorrect scoring)
- [x] Case-insensitive entity type matching throughout (requirements.ts, getOfficerTitle — prevents wrong CDD ruleset or label for inconsistently-cased DB values)
- [x] Corporate sector risk field (49) pre-populated as read-only from `sector_mapping.json` (previously editable but silently overridden by server)
- [x] All automatic outcome triggers reported in audit trail (previously only first match was shown)
- [x] Dashboard analytics (role-based dashboards for solicitor/MLRO/admin, risk distribution chart, activity feed, pending approvals queue, CDD expiry warnings, assessment staleness warnings, 7 summary metrics)
- [x] Per-firm rules engine config / multi-tenant calibration (7-step wizard: risk appetite, scoring weights, automatic outcomes, CDD actions, sector mapping, CDD staleness, review; regulatory baseline validation; gap acknowledgement workflow; config versioning; admin overview pages; config loader integrated into assessment engine; falls back to static defaults)
- [x] Platform admin config management (firm config status list, per-firm detail view, regulatory baseline viewer)
- [x] Firm document uploads (PWRA/PCP/AML policy upload with file metadata, linked to config versions)
- [x] Form question contextual help / Phase 3 assistant (QuestionHelperButton wired into AssessmentForm, passes question context to AssistantPanel)
- [x] Assessment staleness warnings (risk-based thresholds: HIGH 12mo, MEDIUM/LOW 24mo; dashboard widgets for solicitor + MLRO; matter detail page banner with re-run link; config in `assessment_staleness.json`)
- [x] CDD universal longstop (hard 2-year deadline; CDDStatusBanner shows red longstop warning; FinaliseButton disabled when breached; server-side finalisation guard in `assessments.ts`; dashboard CDD warnings show RE-VERIFY badge; matter detail page CddLongstopBanner; null-CDD clients flagged)
- [x] Old monitoring module removed (calendar-based review forms, /monitoring pages, monitoring_reviews table — replaced by event-driven staleness warnings + CDD longstop above)
- [x] CDD "Confirm still valid" carry-forward (identity verification actions show carry-forward button when client has recent in-date verification within risk-based thresholds; creates manual evidence record, auto-marks checklist item complete, audit logs; server-side threshold re-check; disappears when threshold exceeded or evidence already exists)
- [x] Last identity verification date on new client form (optional date field for onboarding clients with prior Amiqus verifications, enables carry-forward on first assessment)
- [x] Amiqus webhook configured (webhook URL registered in Amiqus dashboard, webhook secret stored in `firm_integrations` table, signature verification via SECURITY DEFINER RPC)
- [x] Companies House lookup on new client form (company number field with CH API lookup for corporate clients, auto-populate registered address, adopt CH name)
- [x] Corporate form funds direction question (field 56 in `CMLRA_corporate.json` — mirrors individual form; gates SoF questions by paying/receiving/both direction; receiving-only hides "Who provides funds?" and "Source of funds?", shows "Who will send?" and "Nature of incoming?"; no scoring impact — purely visibility control via `show_if` + `smart_logic_fields`)
- [x] "Compliance Assistant" renamed to "Compliance Hub" in all user-facing form text (individual + corporate CMLRA forms); assistant internal system prompt unchanged
- [x] "View Determination" button renamed to "View Risk Assessment Scoring"; determination page now shows only scoring breakdown (assessment details, risk determination, scoring table) — not full determination document
- [x] Export as PDF button on assessment page (`ExportPdfButton.tsx`) — uses `window.print()` with `@media print` CSS; collapsible sections (AssessmentDetail, CompaniesHouseCard, DeclarationCard) always render content in DOM (hidden via CSS class), forced visible in print
- [x] Existing client pre-population & CDD carry-forward:
  - `isExistingClient` is now **client-level** (any prior assessment across any matter), not matter-level
  - New matter for existing client pre-populates client-level fields (Sections 2 & 4) from latest prior assessment; matter-specific fields (Sections 3, 5, 7) left blank
  - Corporate client fields carried forward: 20, 22, 24, 26, 28, 30, 32, 34, 45, 46, 47, 51, 72; Individual: 16, 18, 20, 31, 32, 52
  - Delivery channel field locked (read-only) for existing clients: field 72 (corporate), field 52 (individual)
  - Re-run on same matter still copies ALL fields (existing behaviour preserved)
  - Info banner shown when pre-populating from a different matter
  - `getLatestAssessmentForClient()` in `assessments.ts` — queries all matters for client, returns latest full assessment
  - Companies House lookup auto-carried forward to new assessments for corporate clients (`carryForwardCompaniesHouse()` in `evidence.ts`); checks 24-month longstop; copies evidence with "Carried forward" source; auto-marks CDD item complete; "Carried forward" badge + "Refresh Lookup" button on CDD checklist
  - SoW declaration pre-populated from prior client assessment (`getLatestSowForClient()` in `evidence.ts`); form fully editable; "Pre-filled from a previous assessment" info banner
  - Identity verification (directors, BOs, individual): handled by existing "Confirm Still Valid" mechanism — `client.last_cdd_verified_at` is client-level, so carry-forward works automatically on new matters
  - SoF: NOT carried forward (matter-specific — different transaction = different funds)

### Pending SQL Migrations (not yet applied to Supabase)

The following migrations exist in `supabase/migrations/` but have not yet been applied:
- `20260223_entity_delete_policies.sql` — DELETE RLS policies for clients, matters, assessments, evidence, CDD progress
- `20260223_platform_admin_role.sql` — Widens role CHECK constraints, adds platform_admin RLS policies, sets initial platform_admin user
- `20260223_assessment_reference.sql` — Adds `reference` column to assessments (backfill + NOT NULL + UNIQUE)
- `20260223_mlro_approval_requests.sql` — MLRO approval requests table + RLS policies
- `20260224_evidence_verified_at.sql` — Adds `verified_at date` column to `assessment_evidence`
- `20260224_client_cdd_tracking.sql` — Adds `last_cdd_verified_at date` to `clients` + UPDATE RLS policy
- `20260226_integrations.sql` — `firm_integrations` + `amiqus_verifications` tables, `matters.clio_matter_id`, 4 SECURITY DEFINER webhook RPCs, pgcrypto extension
- `20260226_firm_config.sql` — `regulatory_baseline`, `firm_config_versions`, `firm_config_gap_acknowledgements`, `firm_documents` tables; `firms.config_status` + `active_config_version_id` columns; `assessments.config_version_id` column; `firm-documents` storage bucket + RLS; all table RLS policies
- `20260226_firm_config_seed.sql` — Seeds initial regulatory baseline v1 from static config

### Infrastructure Pending

- ~~Evidence storage bucket~~ — Not needed. Identity verification documents are stored in Amiqus, corporate verification is via Companies House API (JSON in `assessment_evidence.data`), and SoW/SoF declarations are form-based. No file uploads required. The `firm-documents` bucket (for PWRA/PCP policy uploads) is created by the `firm_config` migration.

### Incomplete / Not Yet Built

- [ ] SAR (Suspicious Activity Report) workflow (no routes, pages, or components; POCA source excerpts exist for assistant)
- [ ] Phase 2 — Firm source ingestion (admin UI for MLRO to upload/paste PCP content, human-curated chunking, auto-embeddings)
- [ ] Source excerpt versioning / update tracking (Phase 1 external library complete; `effective_date` field exists but no update tracking UI)
- [ ] Automated testing coverage for UI components
- [ ] Generated Supabase types (currently manual)

---

## 11. Known Technical Debt

1. **No generated Supabase types.** The comment in `types.ts` notes "For full type generation, use: `npx supabase gen types typescript`". Currently using manually defined types.
2. **In-memory rate limiter.** The rate limiter uses in-memory storage, which resets on server restart and doesn't work across multiple instances. Acceptable for single-instance deployment but should migrate to Redis or similar for horizontal scaling.
3. **User deactivation is partial.** `deactivateUser()` logs an audit event but does not actually disable the Supabase Auth account (requires service role key or Edge Function). Admin must follow up in the Supabase dashboard.
4. **Source documents and runtime configs in separate locations.** Original policy documents live in `sources/` while the JSON configs imported by the rules engine live in `src/config/eventus/`. Changes to the source documents require manual translation into the JSON configs.
5. **Pending SQL migrations.** Nine migrations created but not yet applied to the live Supabase instance. These need to be run in the Supabase SQL Editor in order. See section 10 for the full list.

---

## 12. Open Issues

1. Form validation on the assessment form is minimal -- required field checks exist but no comprehensive validation before submission.
2. Invite acceptance flow sends users to `/invite/accept` but the email template in Supabase Auth needs to be configured to point to this URL.
3. The CSP header includes `'unsafe-inline'` and `'unsafe-eval'` for `script-src` (required by Next.js). Should be tightened with nonce-based CSP in a future iteration.
4. ~~Client creation form does not capture `registered_number` for corporate clients.~~ ✅ FIXED — New client form now has Company Number field with Companies House lookup for corporate clients.
5. `aml_regulated` field on clients table has no UI for setting it. The field defaults to null on new clients. Field 51 on the corporate assessment form ("Is the client subject to AML supervision?") is not pre-filled — solicitor answers it during assessment.

---

## 13. Non-Negotiable Architectural Constraints

1. **The rules engine must remain deterministic and LLM-free.** Risk scoring is a regulatory function. It must be reproducible and auditable. No AI may influence scoring.
2. **No client data may reach the LLM.** The assistant processes only curated regulatory/policy excerpts and generic questions. This is a data protection and regulatory requirement.
3. **Snapshots are immutable.** Once an assessment is created, its `input_snapshot` and `output_snapshot` must never be modified. Determinations render from these snapshots.
4. **Finalised assessments are locked.** Once `finalised_at` is set, no writes are permitted to that assessment record.
5. **All data access must go through RLS.** No service role keys at runtime. Every database operation uses the authenticated user's session.
6. **Firm isolation is absolute.** Users must never see data from another firm. This is enforced at the PostgreSQL level, not in application code.
7. **Audit logging is mandatory.** All assessment creation, finalisation, and significant actions must produce an `audit_events` record.
8. **Determination language must be declarative.** No conditional words ("if", "consider", "may", "where required") in rendered determinations. Mandatory actions are stated as directives.
9. **Config is the single source of truth for business rules.** Scoring factors, thresholds, CDD actions, EDD triggers, and form definitions live in JSON config files. Code reads config; code does not contain rules.
10. **EDD triggers preserve risk level.** EDD triggers (PCP s.20) inject EDD actions but do NOT change the risk level. A LOW-risk assessment with an EDD trigger stays LOW. Only automatic outcomes (PEP status, client account funds) can override risk level.
11. **Entity exclusions are warnings, not blockers.** When an excluded entity type is detected, the engine still runs and produces a full assessment. Warnings require MLRO escalation but do not prevent the assessment.

---

## 14. Design Philosophy

- **Regulatory defensibility over developer convenience.** Every design decision prioritises auditability and reproducibility.
- **Determinism where it matters.** Scoring and determinations are deterministic. The AI assistant is explicitly not deterministic and must never be used for scoring or determination.
- **Separation of concerns.** The rules engine, determination renderer, assistant, and LLM client are independent modules with clean interfaces. They can be tested, replaced, and audited independently.
- **Config-driven business logic.** When a partner changes the risk model, you change a JSON file, not code.
- **Minimal surface area.** The assistant can only explain; it cannot act. The rules engine can only score; it cannot explain in natural language.
- **Fail closed.** If validation fails, if the LLM is not configured, if the user lacks access -- the operation is denied, never degraded.

---

## 15. Lessons Learned

1. **Consolidate duplicate code immediately.** The previous existence of two determination renderers and two assessment action files caused confusion. Now consolidated into single canonical implementations.
2. **Snapshot pattern is essential.** Storing both input and output at creation time is the only way to guarantee a determination can be reproduced months later, even if config has changed.
3. **PII validation: check for data values, not field names alone.** SoW/SoF as standalone terms are legitimate regulatory vocabulary. The validation now only rejects these when followed by actual data values (e.g., `SoF: £50,000`).
4. **Form config JSON is complex.** The CMLRA form configs use nested sections, conditional visibility (`show_if`), and multiple field types. Changes to form config must be tested against the `AssessmentForm` component renderer.
5. **Config path resolution matters.** The config-loader uses import aliases (`@/config/...`) which resolve to `src/config/`. Config files live in `src/config/eventus/` (NOT `sources/eventus/`). The `sources/` directory holds raw source documents only.
6. **RLS policies and MFA interact.** An AAL2 RLS policy on `user_profiles` blocked all reads for users without MFA, causing a redirect loop. MFA enforcement is now handled in middleware rather than RLS to avoid this coupling.
7. **TypeScript types must match actual DB schema.** The `UserProfile` type had fields (`id`, `email`, `full_name`, `updated_at`) that didn't exist in the database. Always verify types against the actual table schema.
8. **EDD triggers and risk levels are separate concerns.** PCP s.20 says "always require EDD" for certain situations, not "always rate HIGH". Keeping EDD triggers as action injectors (not score modifiers) preserves the integrity of the scoring model while ensuring compliance with policy requirements.
9. **Entity exclusions should warn, not block.** Blocking the engine for excluded entity types would leave the solicitor with no assessment at all. Running the engine and adding escalation warnings ensures there is always a baseline assessment, with clear direction to involve the MLRO.
10. **New client SoW at LOW risk uses lighter requirements.** PCP s.11 says "depth of SoW must increase in line with risk." For new LOW-risk clients: form required, evidence recommended. For MEDIUM+: both required. This avoids over-burdening low-risk new client onboarding while maintaining compliance.

---

## 16. What NOT To Change

1. **Do not add LLM calls to the rules engine.** Not for "better rationale", not for "natural language explanations", not for any reason.
2. **Do not remove or modify stored snapshots.** The snapshot columns are the legal record of what was assessed and what the system determined.
3. **Do not bypass RLS with a service role key.** All runtime database access must be authenticated.
4. **Do not let the assistant access assessment data, client data, or matter data.** It reads only from `assistant_sources`.
5. **Do not add conditional language to determination output.** Determinations state facts and directives, not possibilities.
6. **Do not remove audit logging.** Even if it seems like noise during development, the audit trail is a regulatory requirement.
7. **Do not merge the rules engine and assistant into a single module.** Their separation is an architectural boundary, not an accident.

---

## 17. Next Logical Development Steps

### Priority: Core Features

1. **~~Ongoing monitoring module.~~** Replaced by event-driven approach: assessment staleness warnings + CDD longstop enforcement (see Completed sections below). MonitoringStatement static display retained on assessment detail page.
2. **SAR workflow.** Suspicious Activity Report submission and tracking. No implementation yet; POCA source excerpts exist for assistant context.
3. **Phase 2 — Firm source ingestion.** Admin UI for MLRO to upload/paste PCP content. Human-curated chunking: MLRO identifies section boundaries, assigns topic tags, and reviews content before it becomes a source excerpt. Embeddings generated automatically for vector search (already built). Covers firm-specific procedural questions — e.g., "What documents do we need to verify an instructing director offline?"

### Priority: Infrastructure

4. **~~Apply pending SQL migrations.~~** ✅ All migrations applied (9 of 9 + integrations migration).
5. **~~Create evidence storage bucket.~~** Not needed — Amiqus stores identity docs, Companies House API handles corporate verification. Evidence metadata stored in `assessment_evidence` table.
6. **Generated Supabase types.** Run `npx supabase gen types typescript` and replace manual type definitions.

### Priority: Hardening

7. **Comprehensive test coverage.** Unit tests for all rules engine paths, integration tests for server actions, component tests for forms. Currently 176+ tests across 6+ suites (rules engine: 44, determination: 67, auth: 27, assistant validation: 17, Companies House client: 10, embeddings client: 11, config validator: 11).
8. **Nonce-based CSP.** Replace `'unsafe-inline'`/`'unsafe-eval'` in Content-Security-Policy with nonce-based approach.
9. **Redis-backed rate limiting.** Replace in-memory rate limiter for multi-instance deployments.
10. **Supabase Edge Function for user deactivation.** Complete the deactivation flow by actually disabling the auth account.
11. **Comprehensive form validation.** Currently only required field checks; needs regex, format, range validation before submission.

### Completed: External Integrations (built 26 Feb 2026)

12. **Clio API integration (matter/client sync). ✅ BUILT.**
    - **OAuth 2.0 connection** — firm-level Clio connection via OAuth authorization code flow (`/api/integrations/clio/connect` + `/callback`). Stores `access_token`, `refresh_token`, `token_expires_at` per firm in `firm_integrations` table. Token refresh on expiry.
    - **Webhook endpoint** — `POST /api/webhooks/clio` receives `matter.create` events. Validates HMAC-SHA256 signature via `verify_clio_webhook` SECURITY DEFINER RPC. Auto-creates client (if new) and matter via `process_clio_webhook` RPC. Stores `clio_matter_id` and `clio_contact_id` for back-linking.
    - **Webhook handshake** — echoes `X-Hook-Secret` header on registration validation.
    - **Webhook auto-renewal** — Clio webhooks expire after 7 days. Auto-renewed in two ways: (1) settings page auto-renews on load when ≤2 days remaining, (2) webhook handler auto-renews on each incoming event when ≤2 days remaining. `renewClioWebhook()` server action handles token refresh, old webhook deletion, and new registration.
    - **OAuth token exchange** — Clio requires `application/x-www-form-urlencoded` (not JSON) for `/oauth/token`. Webhook model name is lowercase (`matter`), events are just the action (`created`), and expiry field is `expired_at`.
    - **Files:** `src/lib/clio/client.ts`, `src/lib/clio/types.ts`, `src/lib/clio/index.ts`, `src/app/api/integrations/clio/connect/route.ts`, `src/app/api/integrations/clio/callback/route.ts`, `src/app/api/webhooks/clio/route.ts`, `src/app/actions/integrations.ts`.
    - **Live and tested** — OAuth flow, token exchange, webhook registration, and auto-renewal all verified against live Clio EU instance (2 Mar 2026).
    - **Not yet built:** Manual sync ("Sync from Clio" button).

13. **Amiqus API integration (identity verification). ✅ BUILT (Option C — full webhook-driven).**
    - **Initiate from CDD checklist** — "Initiate Amiqus Verification" button on identity verification CDD actions. Creates Amiqus client + record via API, stores in `amiqus_verifications` table. Shows `perform_url` for client to complete verification.
    - **Webhook endpoint** — `POST /api/webhooks/amiqus` receives `record.finished` and `record.updated` events. Validates base64 HMAC-SHA256 signature via `verify_amiqus_webhook` SECURITY DEFINER RPC. On completion: `process_amiqus_webhook` RPC updates status, creates evidence record, updates `clients.last_cdd_verified_at`.
    - **CDD checklist states** — No verification → initiate button. Pending/in_progress → status badge + complete link. Complete → green verified badge with date. Failed/expired → retry button. Falls back to static Amiqus link when env vars absent.
    - **Data principle:** Amiqus reports (PII) stay in Amiqus. Hub stores only: record ID, status, verification date, and a deep link.
    - **Files:** `src/lib/amiqus/client.ts`, `src/lib/amiqus/types.ts`, `src/lib/amiqus/index.ts`, `src/app/api/webhooks/amiqus/route.ts`, `src/app/actions/amiqus.ts`.

**Integration settings page** — `/settings/integrations` (mlro/admin/platform_admin). Shows connection status, webhook health, connect/disconnect buttons for both providers. Graceful degradation when env vars absent.

### Completed: Dashboard Analytics (built 1 Mar 2026)

14. **Dashboard analytics. ✅ BUILT.**
    - **Role-based dashboards** — SolicitorDashboard (personal assessments, clients, matters, quick actions), MlroDashboard (firm-wide stats, pending approvals queue, CDD expiry warnings), AdminDashboard (platform-wide counts, user management link).
    - **7 summary metrics** — assessmentsByRisk (LOW/MEDIUM/HIGH counts), totalAssessments, pendingApprovals, draftAssessments, totalClients, totalMatters, cddCompletionRate (%).
    - **Visual components** — RiskDistribution (stacked horizontal bar chart), ActivityFeed (last 10 audit events with contextual links and relative timestamps), PendingApprovals (MLRO approval queue with risk levels), CddExpiryWarnings (risk-based staleness alerts, colour-coded).
    - **Files:** `src/app/(authenticated)/dashboard/page.tsx`, `src/app/(authenticated)/dashboard/components/` (8 components), `src/app/actions/dashboard.ts`, `src/app/(authenticated)/dashboard/page.module.css`.

### Completed: Multi-Tenant Calibration (built 1 Mar 2026)

15. **Per-firm rules engine config and assessment form (multi-tenant calibration). ✅ BUILT.**
    - **7-step calibration wizard** — risk appetite thresholds, scoring factor weights, automatic outcomes, CDD actions per risk level, sector mapping, CDD staleness thresholds, final review with gap acknowledgement. Each step saves independently via `saveDraftConfig()`.
    - **Regulatory baseline validation** — `config-validator.ts` validates firm config against `regulatory_baseline_v1.json`. Checks: mandatory scoring factors, automatic outcomes, EDD triggers, CDD actions, prohibited sectors, staleness limits. Returns detailed gaps with severity, authority, and baseline requirement.
    - **Gap acknowledgement workflow** — MLROs must explicitly acknowledge deviations from baseline with min 20-char rationale before activation. Stored in `firm_config_gap_acknowledgements`.
    - **Config versioning** — immutable versions (draft → active → superseded). Every activation audit-logged with `created_by`, `activated_by`, timestamps. Previous versions preserved. Assessments link to `config_version_id`.
    - **Config loader integration** — `config-loader-server.ts` fetches active firm config from DB; falls back to static defaults if unavailable. Integrated into `submitAssessment()`.
    - **Platform admin views** — firm config status list (`/admin/configs`), per-firm detail with version history + gap acknowledgements (`/admin/configs/[firmId]`), regulatory baseline viewer (`/admin/baseline`).
    - **Document management** — PWRA/PCP/AML policy upload at `/settings/calibration/documents` with file metadata, linked to config versions.
    - **Firm onboarding lifecycle** — firm created → MLRO provides PWRA + AML Policy/PCPs → human configures engine via wizard → system validates against regulatory floor → MLRO approves and locks → firm active for assessments.
    - **Files:** `src/app/(authenticated)/settings/calibration/` (14 files), `src/app/(authenticated)/admin/` (3 pages), `src/app/actions/config.ts`, `src/config/platform/regulatory_baseline_v1.json`, `src/lib/rules-engine/baseline-types.ts`, `src/lib/rules-engine/config-loader-server.ts`, `src/lib/rules-engine/config-validator.ts`, `supabase/migrations/20260226_firm_config.sql`, `supabase/migrations/20260226_firm_config_seed.sql`.
    - **Design principles preserved:** No AI in config pipeline. Config created by human who understands firm's policies. Determinism non-negotiable. Stricter than regulations = allowed; weaker = blocked. One engine, many configs.

### Completed: Assistant Phase 3 (built 1 Mar 2026)

16. **Form question contextual help. ✅ BUILT.**
    - `QuestionHelperButton` wired into `AssessmentForm` via `renderFieldLabel()`. Passes `questionId` and `questionText` as `uiContext` to `AssistantPanel`. User can ask follow-up questions about specific form fields.

### Completed: Assessment Staleness & CDD Longstop (built 2 Mar 2026)

18. **Assessment staleness warnings. ✅ BUILT.**
    - **Risk-based thresholds** — HIGH: 12 months, MEDIUM/LOW: 24 months. Config at `src/config/eventus/assessment_staleness.json`.
    - **Dashboard warnings** — `AssessmentStaleWarnings` component on solicitor + MLRO dashboards. Shows clients with open matters whose latest finalised assessment exceeds the threshold. Links to re-run assessment.
    - **Matter detail banners** — `AssessmentStaleBanner` (amber/red) on matter pages when latest assessment is stale or approaching staleness.
    - **Only for clients with open matters** — no warnings for inactive clients.

19. **CDD 2-year universal longstop. ✅ BUILT.**
    - **Hard deadline** — `universalLongstopMonths: 24` in `cdd_staleness.json`. CDD must be re-verified at least every 2 years regardless of risk level.
    - **Dashboard warnings** — `CddExpiryWarnings` enhanced with `longstopBreached` flag and "RE-VERIFY" badge. Clients with null `last_cdd_verified_at` also flagged.
    - **Matter detail banners** — `CddLongstopBanner` (red when breached, amber when approaching, warning when null CDD).
    - **Assessment detail** — `CDDStatusBanner` shows longstop warning superseding risk-based warning.
    - **Finalisation guard** — FinaliseButton disabled + explanation text when longstop breached. Server-side guard in `finaliseAssessment()` rejects if longstop breached (defence in depth).
    - **Old monitoring module removed** — calendar-based review forms, `/monitoring` pages, `monitoring_reviews` table, and related code all deleted. Replaced by event-driven staleness approach.

### Completed: Deployment (2 Mar 2026)

20. **Vercel deployment. ✅ LIVE.**
    - **URL:** `https://eventus-aml-hub.vercel.app`
    - **Region:** London (`lhr1`) for UK data residency.
    - **Auto-deploy:** GitHub repo connected — every push to `main` triggers production deployment.
    - **Environment variables:** 11 vars configured (Supabase, OpenAI, Clio, Companies House, app URL). `NEXT_PUBLIC_*` vars inlined at build time.
    - **Clio OAuth live** — connected and tested against Clio EU instance.
    - **Note:** `output: 'standalone'` removed from `next.config.ts` (conflicts with Vercel's serverless adapter). Windows CRLF in env vars caused initial 500 error — fixed by stripping `\r` before uploading to Vercel.

### Completed: CDD Carry-Forward & Amiqus Webhook (built 2 Mar 2026)

21. **CDD "Confirm still valid" carry-forward. ✅ BUILT.**
    - **Risk-based thresholds** — HIGH: 12 months, MEDIUM/LOW: 24 months (from `cdd_staleness.json`). Universal longstop (24mo) blocks carry-forward entirely.
    - **CDD checklist UI** — Identity verification actions show "Confirm still valid" button with info line ("Identity last verified on {date}, {N} months ago") when client has prior in-date verification. Button disappears when: threshold exceeded, longstop breached, evidence already exists for this action, or action already completed.
    - **Server action** — `confirmIdentityStillValid()` in `evidence.ts`: validates auth/access/not-finalised, server-side threshold re-check, creates `manual_record` evidence with original verification date, calls `toggleItemCompletion()`, updates `last_cdd_verified_at`, audit logs as `identity_confirmed_still_valid`.
    - **New client form field** — Optional "Date of Last Identity Verification" date field on new client form. Enables carry-forward for clients onboarded from prior Amiqus verifications.
    - **Files:** `src/app/actions/evidence.ts`, `src/app/(authenticated)/assessments/[id]/CDDChecklist.tsx`, `src/app/(authenticated)/assessments/[id]/page.tsx`, `src/app/(authenticated)/assessments/[id]/page.module.css`, `src/app/(authenticated)/clients/new/NewClientForm.tsx`, `src/app/actions/clients.ts`, `src/app/(authenticated)/clients/clients.module.css`.

22. **Amiqus webhook live. ✅ CONFIGURED.**
    - Webhook registered in Amiqus dashboard (Workflows → Webhooks, all events).
    - Webhook secret stored in `firm_integrations` table for signature verification.
    - `NEXT_PUBLIC_APP_URL` set in `.env.local` and Vercel environment.

### Roadmap: Explore

17. **AI assistant source strategy — remaining phases.** AI is used ONLY in the assistant (explanatory, source-grounded) — never for config creation, scoring, or CDD determination.
    - **Phase 1 — External source library (platform-wide). ✅ LARGELY COMPLETE.** 47 verbatim excerpt files covering: MLR 2017 (15 key regs), POCA 2002 (7 sections), LSAG 2025 (15 excerpts split from 4 large chapters — CDD, EDD, red flags, corporate structures, plus 4 smaller sections), FATF black/grey lists, NRA 2025, Scottish Sectoral Risk 2022, LSS Rule B9. Remaining: LSAG s5 risk assessment (no raw extract yet), potential additional MLR regs or LSAG sub-sections as gaps are identified in assistant testing.
    - **Phase 2 — Firm source ingestion. NOT YET BUILT.** Admin UI for MLRO to upload/paste PCP content. Human-curated chunking: MLRO identifies section boundaries, assigns topic tags, and reviews content before it becomes a source excerpt. Embeddings generated automatically for vector search (already built). Covers firm-specific procedural questions (use case 2).
    - **Phase 3 — Form question contextual help. ✅ BUILT.** QuestionHelperButton wired into AssessmentForm. Quality will improve as phases 1 and 2 add source material.
    - Internal sources for assistant: firm's PCPs (primary — procedural, answers "how do I..."), AML Policy (strategic — answers "what's our policy on..."), firm-specific guidance notes. NOT risk scoring model or CDD ruleset (those belong in the rules engine, not the assistant — avoids drift between engine behaviour and assistant explanations).

---

## Environment Variables

```env
# Supabase (required)
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=

# LLM Assistant (required for assistant feature)
ASSISTANT_LLM_PROVIDER=openai|anthropic
ASSISTANT_LLM_MODEL=gpt-4o|claude-sonnet-4-20250514
OPENAI_API_KEY=           # if provider is openai; also used for embeddings (vector search)
ANTHROPIC_API_KEY=        # if provider is anthropic

# External integrations (optional — features degrade gracefully when absent)
CLIO_CLIENT_ID=           # Clio OAuth client ID
CLIO_CLIENT_SECRET=       # Clio OAuth client secret
CLIO_REGION=eu            # 'eu' (eu.app.clio.com) or 'us' (app.clio.com), defaults to 'eu'
AMIQUS_API_KEY=           # Amiqus Personal Access Token (PAT)
NEXT_PUBLIC_APP_URL=      # Production URL (e.g., https://eventus-aml-hub.vercel.app) — used for OAuth redirects and webhook URLs
```

Note: Supabase JWT expiry and MFA settings should be configured in the Supabase dashboard. The application enforces a 30-minute idle session timeout via middleware independently of JWT expiry.

---

*Last updated: 2 Mar 2026. Recent changes: Assessment staleness warnings (dashboard + matter pages). CDD 2-year longstop enforcement (UI + server guard, blocks finalisation). Old monitoring module removed. Clio OAuth live (form-encoded token exchange, 7-day webhook auto-renewal). Deployed to Vercel EU (London lhr1). All SQL migrations applied. 187+ tests across 7+ suites. Update when architectural decisions change.*
