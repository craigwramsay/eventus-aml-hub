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
| **Jurisdiction** | England & Wales |
| **Regulated sector** | Legal services (SRA-regulated law firms) |
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
├── src/
│   ├── app/
│   │   ├── layout.tsx                # Root layout
│   │   ├── page.tsx                  # Landing page
│   │   ├── login/                    # Authentication
│   │   ├── dashboard/                # Post-login dashboard
│   │   ├── clients/                  # Client CRUD (/clients, /clients/new, /clients/[id])
│   │   ├── matters/                  # Matter CRUD (/matters, /matters/new, /matters/[id])
│   │   ├── assessments/
│   │   │   ├── new/                  # Assessment form (config-driven, dynamic)
│   │   │   └── [id]/
│   │   │       ├── page.tsx          # Assessment result view
│   │   │       ├── FinaliseButton.tsx
│   │   │       └── determination/    # Formal determination document view
│   │   ├── actions/                  # Server Actions (auth, clients, matters, assessment, assistant-sources)
│   │   └── api/
│   │       └── assistant/route.ts    # POST endpoint for AI assistant
│   ├── components/
│   │   └── assistant/                # AssistantPanel, GlobalAssistantButton, QuestionHelperButton
│   ├── lib/
│   │   ├── rules-engine/             # Deterministic AML scoring engine
│   │   ├── determination/            # Snapshot-based determination renderer (legacy)
│   │   ├── determination-renderer/   # Enhanced determination renderer with policy references
│   │   ├── assistant/                # AI assistant orchestration (prompt, validation, sources)
│   │   ├── llm/                      # Pluggable LLM client (OpenAI + Anthropic)
│   │   └── supabase/                 # DB client, server client, types
│   └── middleware.ts                 # Auth middleware (all routes except /login)
├── CLAUDE.md                         # Claude Code project instructions
└── vitest.config.ts
```

---

## 6. Database Schema

### Tables

| Table | Purpose | Key columns |
|-------|---------|-------------|
| `firms` | Law firm entities | `id`, `name` |
| `user_profiles` | Users scoped to firm | `id` (= auth.uid), `firm_id`, `email`, `full_name`, `role` |
| `clients` | Clients of the firm | `id`, `firm_id`, `name`, `client_type` (individual/corporate) |
| `matters` | Legal matters | `id`, `firm_id`, `client_id`, `reference`, `description`, `status` |
| `assessments` | Risk assessments | `id`, `firm_id`, `matter_id`, `input_snapshot` (JSON), `output_snapshot` (JSON), `risk_level`, `score`, `created_by`, `finalised_at`, `finalised_by` |
| `audit_events` | Complete activity log | `id`, `firm_id`, `entity_type`, `entity_id`, `action`, `metadata` (JSON), `created_by` |
| `assistant_sources` | Curated knowledge base | `id`, `firm_id`, `source_type` (external/internal), `source_name`, `section_ref`, `topics` (text[]), `content`, `effective_date` |

### Relationships

```
Firm ──< UserProfile
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

Two renderer implementations exist:
- `src/lib/determination/` -- Renders from stored `AssessmentRecord` (snapshot-based).
- `src/lib/determination-renderer/` -- Enhanced renderer that includes policy references (PCP, MLR, LSAG section numbers).

Both are **deterministic**: no LLM, no recomputation, no conditional language ("if", "consider", "may" are prohibited in output). Same input always produces identical text.

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
- Personal data value patterns (UK postcodes, NI numbers, date-of-birth formats)
- Empty or excessively long questions (max 2000 chars)

### Source retrieval

Keyword-based topic extraction → `overlaps` query on `assistant_sources.topics[]` → fallback to all sources if no match. No vector search currently implemented.

---

## 9. Security Model

| Control | Implementation |
|---------|---------------|
| **Authentication** | Supabase Auth (email/password) |
| **Session management** | Cookie-based via `@supabase/ssr` |
| **Route protection** | Next.js middleware redirects unauthenticated users to `/login` |
| **Data isolation** | PostgreSQL RLS policies on all tables, scoped by `firm_id` |
| **No service role key** | All server actions use the authenticated user's session |
| **Assessment immutability** | `finalised_at` timestamp locks the record; `checkAssessmentModifiable()` guard |
| **No PII to LLM** | `validation.ts` pattern-matches and rejects client data before it reaches the LLM |
| **Audit trail** | All significant actions logged to `audit_events` (assistant questions logged by length only, not content) |
| **Snapshot integrity** | `input_snapshot` and `output_snapshot` stored at creation; determination renders from snapshots, never recomputes |
| **LLM isolation** | LLM only receives curated source excerpts and the user's question; no database access, no client data |

---

## 10. Current Feature Status

### Working

- [x] Authentication (login/logout, session refresh, middleware protection)
- [x] Dashboard (navigation hub)
- [x] Client CRUD (list, create, view with matters)
- [x] Matter CRUD (list, create, view with assessments)
- [x] Assessment form (config-driven, dynamic fields, conditional visibility, individual + corporate)
- [x] Deterministic rules engine (scoring, risk levels, automatic outcomes, mandatory actions)
- [x] Assessment result view (score, risk level, contributing factors, mandatory actions)
- [x] Determination rendering (formal document from snapshots, both renderer variants)
- [x] Assessment finalisation (immutable lock with audit event)
- [x] Determination copy-to-clipboard
- [x] AI assistant panel (question input, source-grounded answers, citations)
- [x] Per-question helper buttons on assessment form
- [x] Assistant input validation (PII rejection)
- [x] Pluggable LLM client (OpenAI + Anthropic)
- [x] Source excerpt ingestion pipeline (YAML frontmatter parser, Supabase insert)
- [x] Audit event logging
- [x] Multi-tenant firm isolation (RLS)

### Incomplete / Not Yet Built

- [ ] User management / invitation flow
- [ ] Role-based access control (role field exists but not enforced)
- [ ] Assessment editing / re-assessment workflow
- [ ] PDF export of determinations
- [ ] Client/matter search and filtering
- [ ] Dashboard analytics / reporting
- [ ] Ongoing monitoring tracking
- [ ] SAR (Suspicious Activity Report) workflow
- [ ] Vector/semantic search for assistant sources (currently keyword-based)
- [ ] Source excerpt versioning / update tracking
- [ ] Automated testing coverage for UI components
- [ ] Production deployment configuration

---

## 11. Known Technical Debt

1. **Two determination renderers.** `src/lib/determination/` and `src/lib/determination-renderer/` overlap in purpose. The latter adds policy references and should be the canonical implementation. Consolidate or deprecate the former.
2. **Duplicate assessment actions.** Both `src/app/actions/assessment.ts` and `src/app/actions/assessments.ts` export `submitAssessment`. The `assessment.ts` version is more complete (includes finalisation, details retrieval). Consolidate.
3. **Hardcoded thresholds in determination renderer.** `renderDetermination.ts` has `THRESHOLD_TEXT: { LOW: '0-4', MEDIUM: '5-8', HIGH: '9+' }` which duplicates config values. Should read from the scoring config.
4. **Keyword-based source retrieval.** The `KEYWORD_TOPICS` mapping in `sources.ts` is manual and incomplete. Should be replaced with vector/semantic search or at minimum a more robust matching strategy.
5. **No generated Supabase types.** The comment in `types.ts` notes "For full type generation, use: `npx supabase gen types typescript`". Currently using manually defined types.
6. **`getUser()` and `getUserProfile()` referenced but not imported** in `submitAssessment` in `assessment.ts` (lines 87-101 reference standalone functions while `getUserAndProfile` helper exists and is used by `finaliseAssessment`).
7. **Config imports use `@/config/` path alias.** The config-loader imports from `@/config/eventus/...` but configs live under `sources/eventus/`. This requires a tsconfig path alias or the files to be copied/symlinked to `src/config/`.

---

## 12. Open Issues

1. The middleware matcher excludes API routes from auth (`api routes (handled separately)` comment), but the assistant API route at `/api/assistant` does not perform its own authentication check -- it relies on calling `getUserProfile()` internally. Verify this is sufficient.
2. `SoW` and `SoF` regex patterns in `validation.ts` may cause false positives (e.g., "What does SoW mean?" would be rejected as containing client data). Consider context-aware validation.
3. Form validation on the assessment form is minimal -- required field checks exist but no comprehensive validation before submission.

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

1. **Keep two renderer implementations in sync or consolidate immediately.** The existence of `determination/` and `determination-renderer/` has already caused confusion about which is canonical.
2. **Snapshot pattern is essential.** Storing both input and output at creation time is the only way to guarantee a determination can be reproduced months later, even if config has changed.
3. **PII validation needs refinement.** Overly broad regex patterns (e.g., "SoW", "SoF") reject legitimate regulatory questions. Consider checking for data values rather than field name keywords alone.
4. **Form config JSON is complex.** The CMLRA form configs use nested sections, conditional visibility (`show_if`), and multiple field types. Changes to form config must be tested against the `AssessmentForm` component renderer.
5. **Config path resolution matters.** The config-loader uses import aliases (`@/config/...`) which must resolve correctly in both dev and production builds.

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

1. **Consolidate duplicate code.** Merge the two assessment action files. Choose one determination renderer as canonical and remove the other.
2. **Role-based access control.** The `role` field exists on `user_profiles`. Implement enforcement (e.g., only MLRO or partner can finalise assessments).
3. **PDF export.** Render the determination document as a downloadable PDF for filing with the matter.
4. **Vector/semantic search for assistant sources.** Replace keyword-based topic matching with embedding-based retrieval for more accurate source selection.
5. **Assessment re-run workflow.** Allow creating a new assessment for the same matter (re-assessment) while preserving the original. Never modify the original.
6. **Dashboard analytics.** Summary stats: assessments by risk level, outstanding mandatory actions, matters pending assessment.
7. **Ongoing monitoring module.** Track that mandatory monitoring actions are being completed on schedule.
8. **Generated Supabase types.** Run `npx supabase gen types typescript` and replace manual type definitions.
9. **Comprehensive test coverage.** Unit tests for all rules engine paths, integration tests for server actions, component tests for forms.
10. **Production deployment.** Environment configuration, CI/CD pipeline, monitoring, error tracking.

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

---

*This document was generated from the codebase at commit history as of the current working state. Update it when architectural decisions change.*
