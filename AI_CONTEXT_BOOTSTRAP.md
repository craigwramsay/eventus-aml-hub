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
| **Risk scoring model** | Eventus Internal Risk Scoring Model v3.7 (PCP S4) |
| **CDD ruleset** | Derived from PCPs, MLR 2017, LSAG 2025 |
| **Assessment form** | Client & Matter Level Risk Assessment (CMLRA) -- individual and corporate variants |

Key regulatory requirements enforced by the system:
- Risk-based approach to CDD (MLR 2017 reg. 28).
- Enhanced due diligence for high-risk situations (MLR 2017 regs. 33, 35).
- Source of wealth and source of funds verification where required.
- Ongoing monitoring obligations.
- Automatic HIGH risk escalation for specific triggers (e.g., PEP status, sanctioned jurisdictions).

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
├── scripts/                          # CLI tools (excerpt parser, ingest)
├── sources/
│   ├── eventus/
│   │   ├── excerpts/                 # Internal policy excerpts (YAML frontmatter + content)
│   │   ├── forms/                    # CMLRA form configs (JSON)
│   │   │   ├── CMLRA_individual.json
│   │   │   └── CMLRA_corporate.json
│   │   └── rules/                    # Risk scoring + CDD ruleset configs (JSON)
│   │       ├── risk_scoring_v3_7.json
│   │       └── cdd_ruleset.json
│   └── external/
│       └── excerpts/                 # Regulatory excerpts (MLR 2017, LSAG 2025, etc.)
├── supabase/migrations/              # SQL migrations for schema changes
├── src/
│   ├── app/
│   │   ├── layout.tsx                # Root layout (with env validation)
│   │   ├── page.tsx                  # Landing page
│   │   ├── error.tsx                 # Global error boundary
│   │   ├── not-found.tsx             # 404 page
│   │   ├── login/                    # Authentication
│   │   ├── auth/callback/            # OAuth/magic link callback
│   │   ├── set-password/             # Password setup page
│   │   ├── mfa/setup/                # TOTP MFA enrolment (QR code)
│   │   ├── mfa/verify/               # TOTP MFA challenge
│   │   ├── dashboard/                # Post-login dashboard (role-aware)
│   │   ├── clients/                  # Client CRUD (/clients, /clients/new, /clients/[id])
│   │   ├── matters/                  # Matter CRUD (/matters, /matters/new, /matters/[id])
│   │   ├── assessments/
│   │   │   ├── new/                  # Assessment form (config-driven, dynamic)
│   │   │   └── [id]/
│   │   │       ├── page.tsx          # Assessment result view (role-gated finalise)
│   │   │       ├── FinaliseButton.tsx
│   │   │       └── determination/    # Formal determination document view
│   │   ├── users/                    # User management (admin-only)
│   │   │   ├── page.tsx              # User list + pending invitations
│   │   │   ├── invite/               # Invite user form
│   │   │   └── [id]/                 # User detail / role edit / deactivate
│   │   ├── invite/accept/            # Invitation acceptance + password setup
│   │   ├── actions/                  # Server Actions (auth, assessments, clients, matters, users, assistant-sources)
│   │   └── api/
│   │       ├── assistant/route.ts    # POST endpoint for AI assistant (rate-limited)
│   │       └── health/route.ts       # Health check endpoint
│   ├── components/
│   │   └── assistant/                # AssistantPanel, GlobalAssistantButton, QuestionHelperButton
│   ├── lib/
│   │   ├── auth/                     # RBAC: roles, permission checks (solicitor/mlro/admin)
│   │   ├── rules-engine/             # Deterministic AML scoring engine
│   │   ├── determination/            # Consolidated determination renderer (snapshots + policy references + jurisdiction)
│   │   ├── assistant/                # AI assistant orchestration (prompt, validation, sources)
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
| `assessments` | Risk assessments | `id`, `firm_id`, `matter_id`, `input_snapshot` (JSON), `output_snapshot` (JSON), `risk_level`, `score`, `created_by`, `finalised_at`, `finalised_by` |
| `audit_events` | Complete activity log | `id`, `firm_id`, `entity_type`, `entity_id`, `action`, `metadata` (JSON), `created_by` |
| `assistant_sources` | Curated knowledge base | `id`, `firm_id`, `source_type` (external/internal), `source_name`, `section_ref`, `topics` (text[]), `content`, `effective_date` |

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
- **`assessments.input_snapshot`** stores a complete copy of form answers at submission time. This is the reproducibility guarantee.
- **`assessments.output_snapshot`** stores the complete engine output (score, riskLevel, riskFactors, mandatoryActions, rationale, automaticOutcome, timestamp).
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
│  config-loader   │───▶│ risk_scoring_v3_7.json    │
│                  │───▶│ cdd_ruleset.json          │
│                  │───▶│ CMLRA_individual.json      │
│                  │───▶│ CMLRA_corporate.json       │
└─────────────────┘
       │
       ▼
┌─────────────────┐
│    scorer.ts     │  calculateScore() → { score, riskLevel, riskFactors, automaticOutcome }
└─────────────────┘
       │
       ▼
┌─────────────────┐
│ requirements.ts  │  getMandatoryActions() → MandatoryAction[]
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
  → AssessmentOutput { score, riskLevel, automaticOutcome, riskFactors, rationale, mandatoryActions, timestamp }
```

### Non-negotiable properties

1. **Zero hardcoded rules.** All scoring factors, thresholds, outcomes, and CDD actions live in JSON config files.
2. **Deterministic.** Identical input + identical config = identical output. Always.
3. **No LLM involvement.** The rules engine never calls any AI service.
4. **Config-versioned.** The scoring model has a version (`v3.7`) and version date. Config changes are tracked.
5. **Automatic outcomes.** Certain answers (e.g., PEP = Yes) trigger automatic HIGH risk with mandatory EDD, regardless of score.
6. **Threshold-based risk levels.** LOW: 0-4, MEDIUM: 5-8, HIGH: 9+.
7. **Snapshot pattern.** Both `input_snapshot` and `output_snapshot` are stored in the assessment record at creation time.

### Determination rendering

**Location:** `src/lib/determination/`

Single consolidated renderer that produces formal risk determination documents from stored snapshots. Includes:
- Policy references (PCP, MLR 2017, LSAG 2025 section numbers) linked to risk factors and mandatory actions
- Jurisdiction-aware regulator details (Law Society of Scotland / SRA)
- Sections: heading, assessment details, risk determination, triggered risk factors, mandatory actions, policy references, risk appetite

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
┌──────────────┐
│  sources.ts   │  Keyword → topic mapping → Supabase query on assistant_sources (firm-scoped)
└──────────────┘
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

Keyword-based topic extraction → `overlaps` query on `assistant_sources.topics[]` → fallback to all sources if no match. No vector search currently implemented.

---

## 9. Security Model

| Control | Implementation |
|---------|---------------|
| **Authentication** | Supabase Auth (email/password) |
| **MFA** | TOTP-based via Supabase Auth (`src/app/mfa/`). Middleware enforces AAL2 for all authenticated routes. |
| **Session management** | Cookie-based via `@supabase/ssr` with 30-minute idle timeout (`aml_last_activity` cookie in middleware) |
| **RBAC** | Three roles: `solicitor`, `mlro`, `admin`. Permission checks in `src/lib/auth/roles.ts`. Enforced in server actions and UI. |
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
- [x] Role-based access control (solicitor/mlro/admin, server-side enforcement)
- [x] User management (admin invite flow, role editing, deactivation)
- [x] Dashboard (navigation hub, role-aware, conditional admin cards)
- [x] Client CRUD (list, create, view with matters)
- [x] Matter CRUD (list, create, view with assessments)
- [x] Assessment form (config-driven, dynamic fields, conditional visibility, individual + corporate)
- [x] Deterministic rules engine (scoring, risk levels, automatic outcomes, mandatory actions)
- [x] Assessment result view (score, risk level, contributing factors, mandatory actions)
- [x] Determination rendering (consolidated renderer with policy references + jurisdiction awareness)
- [x] Assessment finalisation (immutable lock with audit event, role-gated)
- [x] Determination copy-to-clipboard
- [x] AI assistant panel (question input, source-grounded answers, citations, jurisdiction-aware)
- [x] Per-question helper buttons on assessment form
- [x] Assistant input validation (PII rejection, refined SoW/SoF patterns)
- [x] Pluggable LLM client (OpenAI + Anthropic)
- [x] Source excerpt ingestion pipeline (YAML frontmatter parser, Supabase insert)
- [x] Audit event logging (including failed login attempts)
- [x] Multi-tenant firm isolation (RLS)
- [x] Multi-jurisdiction support (Scotland / England & Wales, per-firm setting)
- [x] HTTP security headers (HSTS, CSP, X-Frame-Options, etc.)
- [x] Rate limiting (login, assistant, server actions)
- [x] Password policy enforcement
- [x] Environment variable validation
- [x] Deployment infrastructure (Dockerfile, docker-compose, CI/CD, health check)
- [x] Error boundaries (error.tsx, not-found.tsx)

### Incomplete / Not Yet Built

- [ ] Assessment editing / re-assessment workflow
- [ ] PDF export of determinations
- [ ] Client/matter search and filtering
- [ ] Dashboard analytics / reporting
- [ ] Ongoing monitoring tracking
- [ ] SAR (Suspicious Activity Report) workflow
- [ ] Vector/semantic search for assistant sources (currently keyword-based)
- [ ] Source excerpt versioning / update tracking
- [ ] Automated testing coverage for UI components
- [ ] Generated Supabase types (currently manual)

---

## 11. Known Technical Debt

1. **Hardcoded thresholds in determination renderer.** `renderDetermination.ts` has `THRESHOLD_TEXT: { LOW: '0-4', MEDIUM: '5-8', HIGH: '9+' }` which duplicates config values. Should read from the scoring config.
2. **Keyword-based source retrieval.** The `KEYWORD_TOPICS` mapping in `sources.ts` is manual and incomplete. Should be replaced with vector/semantic search or at minimum a more robust matching strategy.
3. **No generated Supabase types.** The comment in `types.ts` notes "For full type generation, use: `npx supabase gen types typescript`". Currently using manually defined types.
4. **Config imports use `@/config/` path alias.** The config-loader imports from `@/config/eventus/...` but configs live under `sources/eventus/`. This requires a tsconfig path alias or the files to be copied/symlinked to `src/config/`.
5. **In-memory rate limiter.** The rate limiter uses in-memory storage, which resets on server restart and doesn't work across multiple instances. Acceptable for single-instance deployment but should migrate to Redis or similar for horizontal scaling.
6. **User deactivation is partial.** `deactivateUser()` logs an audit event but does not actually disable the Supabase Auth account (requires service role key or Edge Function). Admin must follow up in the Supabase dashboard.

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
9. **Config is the single source of truth for business rules.** Scoring factors, thresholds, CDD actions, and form definitions live in JSON config files. Code reads config; code does not contain rules.

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
5. **Config path resolution matters.** The config-loader uses import aliases (`@/config/...`) which must resolve correctly in both dev and production builds.
6. **RLS policies and MFA interact.** An AAL2 RLS policy on `user_profiles` blocked all reads for users without MFA, causing a redirect loop. MFA enforcement is now handled in middleware rather than RLS to avoid this coupling.
7. **TypeScript types must match actual DB schema.** The `UserProfile` type had fields (`id`, `email`, `full_name`, `updated_at`) that didn't exist in the database. Always verify types against the actual table schema.

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

1. **PDF export.** Render the determination document as a downloadable PDF for filing with the matter.
2. **Vector/semantic search for assistant sources.** Replace keyword-based topic matching with embedding-based retrieval for more accurate source selection.
3. **Assessment re-run workflow.** Allow creating a new assessment for the same matter (re-assessment) while preserving the original. Never modify the original.
4. **Dashboard analytics.** Summary stats: assessments by risk level, outstanding mandatory actions, matters pending assessment.
5. **Ongoing monitoring module.** Track that mandatory monitoring actions are being completed on schedule.
6. **SAR workflow.** Suspicious Activity Report submission and tracking.
7. **Client/matter search and filtering.** Full-text search and filter controls on list pages.
8. **Generated Supabase types.** Run `npx supabase gen types typescript` and replace manual type definitions.
9. **Comprehensive test coverage.** Unit tests for all rules engine paths, integration tests for server actions, component tests for forms. Currently 95 tests across 4 suites.
10. **Nonce-based CSP.** Replace `'unsafe-inline'`/`'unsafe-eval'` in Content-Security-Policy with nonce-based approach.
11. **Redis-backed rate limiting.** Replace in-memory rate limiter for multi-instance deployments.
12. **Supabase Edge Function for user deactivation.** Complete the deactivation flow by actually disabling the auth account.

---

## Environment Variables

```env
# Supabase (required)
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=

# LLM Assistant (required for assistant feature)
ASSISTANT_LLM_PROVIDER=openai|anthropic
ASSISTANT_LLM_MODEL=gpt-4o|claude-sonnet-4-20250514
OPENAI_API_KEY=           # if provider is openai
ANTHROPIC_API_KEY=        # if provider is anthropic
```

Note: Supabase JWT expiry and MFA settings should be configured in the Supabase dashboard. The application enforces a 30-minute idle session timeout via middleware independently of JWT expiry.

---

*Last updated: 19 Feb 2026, after production readiness implementation (commit `11b30cf`). Update when architectural decisions change.*
