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
- EDD triggers from PCP s.20 (client account, TCSP, cross-border, third-party funder) — these inject EDD actions without changing the risk level.
- Source of wealth and source of funds verification where required. New clients at LOW risk require SoW form (PCP s.11).
- Ongoing monitoring obligations.
- Automatic HIGH risk escalation for specific triggers (e.g., PEP status, sanctioned jurisdictions).
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
│   │   └── eventus/                  # Runtime config files (imported by rules engine)
│   │       ├── risk_scoring_v3_8.json  # Risk scoring model (thresholds, factors, EDD triggers)
│   │       ├── cdd_ruleset.json        # CDD/EDD/SoW/SoF action mappings by risk level
│   │       ├── forms/
│   │       │   ├── CMLRA_individual.json  # Individual client form config
│   │       │   └── CMLRA_corporate.json   # Corporate client form config
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
│   │   │   ├── clients/              # Client CRUD (/clients, /clients/new, /clients/[id])
│   │   │   ├── matters/              # Matter CRUD (/matters, /matters/new, /matters/[id])
│   │   │   ├── assessments/
│   │   │   │   ├── AssessmentsList.tsx  # List with sortable table + search + pill filters
│   │   │   │   ├── new/              # Assessment form (config-driven, dynamic)
│   │   │   │   └── [id]/
│   │   │   │       ├── page.tsx      # Assessment result view (EDD triggers, warnings, role-gated finalise)
│   │   │   │       ├── FinaliseButton.tsx
│   │   │   │       ├── DeleteAssessmentButton.tsx
│   │   │   │       └── determination/  # Formal determination document view
│   │   │   └── users/                # User management (admin-only)
│   │   │       ├── page.tsx          # User list + pending invitations
│   │   │       ├── invite/           # Invite user form
│   │   │       └── [id]/             # User detail / role edit / deactivate
│   │   ├── actions/                  # Server Actions (assessments, clients, matters, users, firms, evidence, progress)
│   │   └── api/
│   │       ├── assistant/route.ts    # POST endpoint for AI assistant (rate-limited)
│   │       ├── admin/backfill-embeddings/route.ts  # POST trigger for embedding backfill
│   │       └── health/route.ts       # Health check endpoint
│   ├── components/
│   │   ├── assistant/                # AssistantPanel, GlobalAssistantButton, QuestionHelperButton, AuthenticatedAssistant
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
│   │   ├── rules-engine/             # Deterministic AML scoring engine
│   │   │   ├── types.ts             # All engine types (including EDDTriggerResult, AssessmentWarning)
│   │   │   ├── config-loader.ts     # JSON config importer (singleton cache)
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
| `firms` | Law firm entities | `id`, `name`, `jurisdiction` (`scotland` \| `england_and_wales`) |
| `user_profiles` | Users scoped to firm | `user_id` (PK, = auth.uid), `firm_id`, `email`, `full_name`, `role` (`solicitor` \| `mlro` \| `admin`), `created_at` |
| `user_invitations` | Pending user invites | `id`, `firm_id`, `email`, `role`, `invited_by`, `accepted_at`, `created_at` |
| `clients` | Clients of the firm | `id`, `firm_id`, `name`, `entity_type`, `client_type` |
| `matters` | Legal matters | `id`, `firm_id`, `client_id`, `reference`, `description`, `status` |
| `assessments` | Risk assessments | `id`, `firm_id`, `matter_id`, `reference` (unique, `A-XXXXX-YYYY`), `input_snapshot` (JSON), `output_snapshot` (JSON), `risk_level`, `score`, `created_by`, `finalised_at`, `finalised_by` |
| `audit_events` | Complete activity log | `id`, `firm_id`, `entity_type`, `entity_id`, `action`, `metadata` (JSON), `created_by` |
| `assistant_sources` | Curated knowledge base | `id`, `firm_id`, `source_type` (external/internal), `source_name`, `section_ref`, `topics` (text[]), `content`, `effective_date`, `embedding` (vector(1536), nullable) |

### Functions (RPC)

| Function | Purpose | Notes |
|----------|---------|-------|
| `match_assistant_sources(query_embedding, match_threshold, match_count)` | Vector similarity search for assistant sources | `SECURITY INVOKER` — RLS enforces firm isolation. Returns sources + similarity score. |

### Relationships

```
Firm ──< UserProfile
Firm ──< UserInvitation
Firm ──< Client ──< Matter ──< Assessment
Firm ──< AuditEvent
Firm ──< AssistantSource
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
5. **Automatic outcomes.** Certain answers (e.g., PEP = Yes) trigger automatic HIGH risk with mandatory EDD, regardless of score.
6. **Threshold-based risk levels.** LOW: 0-4, MEDIUM: 5-8, HIGH: 9+.
7. **Snapshot pattern.** Both `input_snapshot` (including jurisdiction) and `output_snapshot` are stored in the assessment record at creation time.

### Key engine concepts

**EDD Triggers (PCP s.20):** Config-driven triggers (client account, TCSP activity, cross-border funds, third-party funder) that inject EDD actions into the mandatory actions list without changing the risk level. A LOW-risk assessment with an EDD trigger stays LOW but gains EDD actions. The PEP trigger remains the only thing that forces automatic HIGH (per MLR reg. 35).

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
- Evidence types shown as sub-lists under applicable mandatory actions
- EDD Triggers section (when present) — listed after RISK DETERMINATION, before TRIGGERED RISK FACTORS
- Warnings section (when present) — shown after MANDATORY ACTIONS with MLRO escalation messaging
- `[Recommended]` label on non-mandatory actions (e.g., evidence at LOW risk)

Standard sections: heading, assessment details, risk determination, [EDD triggers], triggered risk factors, mandatory actions, [warnings], policy references, risk appetite

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
| **No service role key** | All server actions use the authenticated user's session |
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
- [x] Dashboard (navigation hub, role-aware, conditional admin cards)
- [x] Client CRUD (list, create, view with matters, delete — MLRO/platform_admin)
- [x] Matter CRUD (list, create, view with assessments, delete with cascade — MLRO/platform_admin)
- [x] Assessment form (config-driven, dynamic fields, conditional visibility, individual + corporate)
- [x] Assessment references (human-readable `A-XXXXX-YYYY` pattern, unique, shown in lists and detail headers)
- [x] Deterministic rules engine (scoring, risk levels, automatic outcomes, mandatory actions, EDD triggers, entity exclusions, evidence types)
- [x] EDD trigger detection (PCP s.20: client account, TCSP, cross-border, third-party funder)
- [x] Entity exclusion warnings (trusts, unincorporated associations → MLRO escalation)
- [x] New client SoW at LOW risk (form required, evidence recommended)
- [x] Evidence types propagated from CDD config to mandatory actions
- [x] Delivery channel scoring factor (LSAG 5.6.4)
- [x] Assessment result view (score, risk level, contributing factors, mandatory actions, EDD triggers, warnings)
- [x] Determination rendering (consolidated renderer with policy references, jurisdiction, EDD triggers, warnings, evidence types)
- [x] Assessment finalisation (immutable lock with audit event, role-gated)
- [x] Assessment deletion (MLRO/platform_admin, cascades evidence + progress + storage files)
- [x] Determination copy-to-clipboard
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
- [x] PDF export of determinations (browser print with `@media print` styles)
- [x] Sortable tables on all list pages (click column headers for asc/desc, per-column dropdown filters for Risk level)
- [x] Client/matter/assessment search and filtering (text search + type/status pill filters)
- [x] Entity deletion with RLS policies (clients, matters, assessments, evidence, CDD progress — MLRO/admin/platform_admin)
- [x] Interactive CDD checklist with per-item evidence upload
- [x] Companies House integration (company lookup card on corporate assessments)
- [x] Monitoring statement on assessment detail page

### Pending SQL Migrations (not yet applied to Supabase)

The following migrations exist in `supabase/migrations/` but have not yet been applied:
- `20260223_entity_delete_policies.sql` — DELETE RLS policies for clients, matters, assessments, evidence, CDD progress
- `20260223_platform_admin_role.sql` — Widens role CHECK constraints, adds platform_admin RLS policies, sets initial platform_admin user
- `20260223_assessment_reference.sql` — Adds `reference` column to assessments (backfill + NOT NULL + UNIQUE)

### Incomplete / Not Yet Built

- [ ] Dashboard analytics / reporting
- [ ] Ongoing monitoring tracking
- [ ] SAR (Suspicious Activity Report) workflow
- [ ] Source excerpt versioning / update tracking (Phase 1 external library complete; versioning for updates not yet built)
- [ ] Automated testing coverage for UI components
- [ ] Generated Supabase types (currently manual)

---

## 11. Known Technical Debt

1. **No generated Supabase types.** The comment in `types.ts` notes "For full type generation, use: `npx supabase gen types typescript`". Currently using manually defined types.
2. **In-memory rate limiter.** The rate limiter uses in-memory storage, which resets on server restart and doesn't work across multiple instances. Acceptable for single-instance deployment but should migrate to Redis or similar for horizontal scaling.
3. **User deactivation is partial.** `deactivateUser()` logs an audit event but does not actually disable the Supabase Auth account (requires service role key or Edge Function). Admin must follow up in the Supabase dashboard.
4. **Source documents and runtime configs in separate locations.** Original policy documents live in `sources/` while the JSON configs imported by the rules engine live in `src/config/eventus/`. Changes to the source documents require manual translation into the JSON configs.
5. **Pending SQL migrations.** Three migrations created but not yet applied to the live Supabase instance (entity delete policies, platform admin role, assessment reference). These need to be run in the Supabase SQL Editor in order.

---

## 12. Open Issues

1. Form validation on the assessment form is minimal -- required field checks exist but no comprehensive validation before submission.
2. Invite acceptance flow sends users to `/invite/accept` but the email template in Supabase Auth needs to be configured to point to this URL.
3. The CSP header includes `'unsafe-inline'` and `'unsafe-eval'` for `script-src` (required by Next.js). Should be tightened with nonce-based CSP in a future iteration.

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
10. **EDD triggers preserve risk level.** EDD triggers (PCP s.20) inject EDD actions but do NOT change the risk level. A LOW-risk assessment with an EDD trigger stays LOW. Only automatic outcomes (e.g., PEP) can override risk level.
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

1. **Dashboard analytics.** Summary stats: assessments by risk level, outstanding mandatory actions, matters pending assessment.
2. **Ongoing monitoring module.** Track that mandatory monitoring actions are being completed on schedule.
3. **SAR workflow.** Suspicious Activity Report submission and tracking.
4. **Generated Supabase types.** Run `npx supabase gen types typescript` and replace manual type definitions.
5. **Comprehensive test coverage.** Unit tests for all rules engine paths, integration tests for server actions, component tests for forms. Currently 163 tests across 6 suites (rules engine: 43, determination: 67, auth: 15+, assistant validation: 17, Companies House client: 10, embeddings client: 11).
6. **Nonce-based CSP.** Replace `'unsafe-inline'`/`'unsafe-eval'` in Content-Security-Policy with nonce-based approach.
7. **Redis-backed rate limiting.** Replace in-memory rate limiter for multi-instance deployments.
8. **Supabase Edge Function for user deactivation.** Complete the deactivation flow by actually disabling the auth account.

### Roadmap: Explore

9. **Per-firm rules engine config and assessment form (multi-tenant calibration).** Move rules engine config (scoring model, CDD ruleset, AND form questions) from static JSON files to per-firm database-stored config, keyed by `firm_id`. The engine code stays the same (already config-driven); what changes per firm is the config it reads. Form questions and scoring rules are tightly coupled — each question captures a risk factor, each answer gets scored. **No AI in the config pipeline** — config is created by a human who understands the firm's policies, not extracted by an LLM. Determinism is non-negotiable for anything that drives scoring or CDD requirements.
    - **Regulatory baseline template** — standard config encoding all mandatory requirements from MLR 2017 and LSAG 2025. Includes: core form questions (mandatory, can't be removed — client type, jurisdiction, PEP status, SoF complexity, service type, delivery channel, transaction value), core scoring rules, minimum CDD actions, mandatory EDD triggers. This is a starting point for config creation, NOT a usable default — firms cannot run assessments until onboarded.
    - **Firm-specific form questions** — MLRO can add questions specific to their practice (e.g., payment method, referral source, practice-area-specific questions). Each added question must map to a scoring rule. Core questions cannot be removed.
    - **Firm-specific calibration** — derived from the firm's PWRA (risk appetite, practice area weighting, threshold positioning) and AML Policy/PCPs (additional CDD actions, escalation rules, evidence requirements beyond statutory minimum).
    - **MLRO admin UI** — single configuration experience: view/manage form questions (core locked, firm additions editable), scoring rules and weights, risk level thresholds, CDD actions per risk level (minimum locked, additions editable), EDD triggers, practice area mappings, preview with sample assessments.
    - **Validation** — system ensures no firm's config falls below the regulatory floor. Stricter than regulations = allowed; weaker = blocked.
    - **Config versioning** — every change versioned, timestamped, audit logged (who changed what). Previous versions preserved. Assessments unaffected by config changes (snapshot pattern). Version history supports regulatory inspection ("show me your risk model as at 15 March 2026").
    - **Firm onboarding lifecycle (mandatory before assessments can begin):**
      1. *Firm created* — admin sets firm name, jurisdiction. Firm exists but is not yet active for assessments.
      2. *MLRO provides PWRA + AML Policy/PCPs* — mandatory, no shortcut. The hub cannot determine risk or prescribe CDD without the firm's own policies.
      3. *Human translates documents into config* — the MLRO (or us during onboarding) uses the admin UI to set risk factors, weights, thresholds, CDD actions, building on the regulatory baseline template. No AI extraction — a human reads the policies and configures the engine. This is deterministic: the same policies, configured by the same person, produce the same config.
      4. *System validates* config against regulatory floor — deterministic comparison, no AI.
      5. *MLRO approves and locks* — config goes live, firm is active for assessments.
    - **Ongoing lifecycle:**
      - *PWRA annual review* (reg 18(2)) — MLRO reviews current config against updated PWRA, makes adjustments via admin UI → new config version created, audit logged. Previous version preserved.
      - *AML Policy/PCP update* — MLRO reviews config implications if new CDD requirements added. For assistant: new source excerpts created from updated PCPs (old archived).
      - *Regulatory change* — platform baseline updated → all firms notified "review required" → system flags where firm config may need adjustment to meet new baseline → MLRO reviews and confirms.
      - *Practice area change* — MLRO adds new practice areas, configures relevant additional risk factors and CDD requirements via admin UI.
    - Inputs: firm's PWRA + AML Policy/PCPs → human-configured config. One engine, many configs.

10. **AI assistant source strategy and ingestion.** Three use cases, three phases. AI is used ONLY in the assistant (explanatory, source-grounded) — never for config creation, scoring, or CDD determination.
    - **Phase 1 — External source library (platform-wide). ✅ LARGELY COMPLETE.** 47 verbatim excerpt files covering: MLR 2017 (15 key regs), POCA 2002 (7 sections), LSAG 2025 (15 excerpts split from 4 large chapters — CDD, EDD, red flags, corporate structures, plus 4 smaller sections), FATF black/grey lists, NRA 2025, Scottish Sectoral Risk 2022, LSS Rule B9. All content is verbatim text extracted from source PDFs (not paraphrased). Raw extracts stored in `sources/sources_external/extracted/` (35 files). Introduce `source_scope` concept: `platform` (shared, all firms) vs `firm` (firm-specific). Remaining: LSAG s5 risk assessment (no raw extract yet), potential additional MLR regs or LSAG sub-sections as gaps are identified in assistant testing.
    - **Phase 2 — Firm source ingestion.** Admin UI for MLRO to upload/paste PCP content. Human-curated chunking: MLRO identifies section boundaries, assigns topic tags, and reviews content before it becomes a source excerpt. Embeddings generated automatically for vector search (already built). Covers firm-specific procedural questions (use case 2) — e.g., "What documents do we need to verify an instructing director offline?"
    - **Phase 3 — Form question contextual help.** Wire existing `QuestionHelperButton` into assessment form fields (component exists, not yet integrated). Optionally pre-map form questions to source topics for better retrieval. Assistant opens with question context loaded, user can ask follow-ups. Quality improves as phases 1 and 2 add source material. Covers use case 3.
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
```

Note: Supabase JWT expiry and MFA settings should be configured in the Supabase dashboard. The application enforces a 30-minute idle session timeout via middleware independently of JWT expiry.

---

*Last updated: 23 Feb 2026. Recent changes: app shell (sidebar/topbar), route groups (authenticated/public), platform admin role with firm switcher, entity deletion (client/matter/assessment cascade with RLS), assessment references (A-XXXXX-YYYY), sortable/filterable list tables, interactive CDD checklist with evidence. 3 pending SQL migrations. 163 tests passing across 6 suites. Update when architectural decisions change.*
