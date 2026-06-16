'use server';

/**
 * Server Actions for the Role-Differentiated Dashboard
 *
 * All queries are firm-scoped via RLS. Solicitors see their own data;
 * MLROs/admins/platform_admins see firm-wide data.
 */

import { createClient } from '@/lib/supabase/server';
import type { UserRole } from '@/lib/auth/roles';
import type { RiskLevel } from '@/lib/supabase/types';
import { getCddStalenessConfig, getAssessmentStalenessConfig } from '@/lib/rules-engine/config-loader';

// ── Types ──────────────────────────────────────────────────────────

export interface DashboardData {
  assessmentsByRisk: { LOW: number; MEDIUM: number; HIGH: number };
  totalAssessments: number;
  pendingApprovals: number;
  draftAssessments: number;
  totalClients: number;
  totalMatters: number;
  cddCompletionRate: number; // 0-100
}

export interface ActivityFeedItem {
  id: string;
  action: string;
  entityType: string;
  entityId: string;
  description: string;
  createdAt: string;
  createdByName: string;
  link: string | null;
}

export interface CddExpiryWarning {
  clientId: string;
  clientName: string;
  lastVerifiedAt: string | null;
  riskLevel: string;
  thresholdMonths: number;
  expiresAt: string | null;
  daysRemaining: number;
  status: 'expiring_soon' | 'expired';
  longstopBreached: boolean;
}

export interface AssessmentStaleWarning {
  clientId: string;
  clientName: string;
  latestAssessmentId: string;
  latestAssessmentDate: string;
  riskLevel: string;
  thresholdMonths: number;
  monthsElapsed: number;
  status: 'stale' | 'approaching';
  matterId: string;
  matterReference: string;
}

/**
 * A single matter that needs action — exactly one of four categories:
 *   - no_assessment: matter is open but no finalised risk assessment yet
 *   - no_cdd: assessment is finalised but the client has no recorded CDD
 *   - cdd_expiring: assessment + CDD done, CDD is within 60 days of risk-based expiry
 *   - cdd_expired: assessment + CDD done, CDD has lapsed past the risk-based expiry
 *     (or the 24-month universal longstop)
 *
 * Matters with finalised assessment AND a current CDD that isn't expiring don't
 * appear at all — no action required.
 */
export type MatterActionCategory =
  | 'no_assessment'
  | 'no_cdd'
  | 'cdd_expiring'
  | 'cdd_expired';

export interface MatterActionItem {
  matterId: string;
  matterReference: string;
  matterDescription: string | null;
  matterCreatedAt: string;
  clientId: string;
  clientName: string;
  /** Null when there's no finalised assessment yet (no_assessment category). */
  riskLevel: 'LOW' | 'MEDIUM' | 'HIGH' | null;
  category: MatterActionCategory;
  /** For cdd_expiring + cdd_expired: ISO timestamp at which CDD lapses. */
  cddExpiresAt: string | null;
  /** For cdd_expiring: positive number of days until expiry. */
  daysUntilExpiry: number | null;
  /** For cdd_expired: positive number of days since expiry. */
  daysSinceExpiry: number | null;
  /** Source of truth for whose CDD is at issue. */
  lastCddVerifiedAt: string | null;
}

export interface MatterActionItemsResult {
  noAssessment: MatterActionItem[];
  noCdd: MatterActionItem[];
  cddExpiring: MatterActionItem[];
  cddExpired: MatterActionItem[];
}

// ── Helpers ────────────────────────────────────────────────────────

function isSolicitor(role: UserRole): boolean {
  return role === 'solicitor';
}

function describeAuditEvent(
  entityType: string,
  action: string,
  metadata: Record<string, unknown> | null
): { description: string; link: string | null } {
  const ref = metadata?.reference as string | undefined;
  const name = metadata?.name as string | undefined;
  const assessmentId = metadata?.assessment_id as string | undefined;
  const entityId = metadata?.entity_id as string | undefined;

  switch (`${entityType}:${action}`) {
    case 'assessment:assessment_created':
      return {
        description: `Created assessment ${ref || ''}`.trim(),
        link: entityId ? `/assessments/${entityId}` : null,
      };
    case 'assessment:assessment_finalised':
      return {
        description: `Finalised assessment ${ref || ''}`.trim(),
        link: entityId ? `/assessments/${entityId}` : null,
      };
    case 'mlro_approval:approval_requested':
      return {
        description: 'Requested MLRO approval',
        link: assessmentId ? `/assessments/${assessmentId}` : null,
      };
    case 'mlro_approval:approval_granted':
      return {
        description: 'Approved assessment',
        link: assessmentId ? `/assessments/${assessmentId}` : null,
      };
    case 'mlro_approval:approval_rejected':
      return {
        description: 'Rejected assessment',
        link: assessmentId ? `/assessments/${assessmentId}` : null,
      };
    case 'client:client_created':
      return {
        description: `Added client ${name || ''}`.trim(),
        link: entityId ? `/clients/${entityId}` : null,
      };
    case 'matter:matter_created':
      return {
        description: `Created matter ${ref || ''}`.trim(),
        link: entityId ? `/matters/${entityId}` : null,
      };
    case 'evidence:evidence_uploaded':
      return {
        description: 'Uploaded evidence',
        link: assessmentId ? `/assessments/${assessmentId}` : null,
      };
    case 'cdd_item:cdd_item_completed':
      return {
        description: 'Completed CDD item',
        link: assessmentId ? `/assessments/${assessmentId}` : null,
      };
    case 'config:config_activated': {
      const version = metadata?.version as string | undefined;
      return {
        description: `Activated firm config v${version || '?'}`,
        link: null,
      };
    }
    default:
      return {
        description: `${action.replace(/_/g, ' ')}`,
        link: null,
      };
  }
}

// ── Server Actions ─────────────────────────────────────────────────

export async function getDashboardData(
  userId: string,
  firmId: string,
  role: UserRole
): Promise<DashboardData> {
  const supabase = await createClient();
  const scopeOwn = isSolicitor(role);

  // Assessment counts by risk level
  let assessmentQuery = supabase
    .from('assessments')
    .select('risk_level');
  if (scopeOwn) assessmentQuery = assessmentQuery.eq('created_by', userId);

  const { data: assessments } = await assessmentQuery;

  const assessmentsByRisk = { LOW: 0, MEDIUM: 0, HIGH: 0 };
  let totalAssessments = 0;
  if (assessments) {
    for (const a of assessments) {
      const level = a.risk_level as RiskLevel;
      if (level in assessmentsByRisk) assessmentsByRisk[level]++;
      totalAssessments++;
    }
  }

  // Draft (unfinalised) assessments
  let draftQuery = supabase
    .from('assessments')
    .select('id', { count: 'exact', head: true })
    .is('finalised_at', null);
  if (scopeOwn) draftQuery = draftQuery.eq('created_by', userId);

  const { count: draftAssessments } = await draftQuery;

  // Pending approvals (firm-wide — MLROs see all, solicitors see 0)
  const { count: pendingApprovals } = await supabase
    .from('mlro_approval_requests')
    .select('id', { count: 'exact', head: true })
    .eq('status', 'pending');

  // Client count
  const { count: totalClients } = await supabase
    .from('clients')
    .select('id', { count: 'exact', head: true });

  // Matter count
  let matterQuery = supabase
    .from('matters')
    .select('id', { count: 'exact', head: true });
  if (scopeOwn) matterQuery = matterQuery.eq('created_by', userId);

  const { count: totalMatters } = await matterQuery;

  // CDD completion rate — among finalised assessments, % with all CDD items completed
  let finalisedQuery = supabase
    .from('assessments')
    .select('id')
    .not('finalised_at', 'is', null);
  if (scopeOwn) finalisedQuery = finalisedQuery.eq('created_by', userId);

  const { data: finalisedAssessments } = await finalisedQuery;

  let cddCompletionRate = 0;
  if (finalisedAssessments && finalisedAssessments.length > 0) {
    // Get CDD progress for these assessments
    const assessmentIds = finalisedAssessments.map((a) => a.id);
    const { data: cddItems } = await supabase
      .from('cdd_item_progress')
      .select('assessment_id, completed_at')
      .in('assessment_id', assessmentIds);

    if (cddItems && cddItems.length > 0) {
      // Group by assessment_id
      const byAssessment = new Map<string, { total: number; completed: number }>();
      for (const item of cddItems) {
        const entry = byAssessment.get(item.assessment_id) || { total: 0, completed: 0 };
        entry.total++;
        if (item.completed_at) entry.completed++;
        byAssessment.set(item.assessment_id, entry);
      }
      // Count assessments where all items are completed
      let fullyCompleted = 0;
      for (const entry of byAssessment.values()) {
        if (entry.total > 0 && entry.completed === entry.total) fullyCompleted++;
      }
      cddCompletionRate = Math.round((fullyCompleted / finalisedAssessments.length) * 100);
    }
  }

  return {
    assessmentsByRisk,
    totalAssessments,
    pendingApprovals: pendingApprovals || 0,
    draftAssessments: draftAssessments || 0,
    totalClients: totalClients || 0,
    totalMatters: totalMatters || 0,
    cddCompletionRate,
  };
}

export async function getActivityFeed(
  firmId: string,
  role: UserRole,
  userId: string
): Promise<ActivityFeedItem[]> {
  const supabase = await createClient();
  const scopeOwn = isSolicitor(role);

  let query = supabase
    .from('audit_events')
    .select('id, entity_type, entity_id, action, metadata, created_at, created_by')
    .order('created_at', { ascending: false })
    .limit(10);

  if (scopeOwn) query = query.eq('created_by', userId);

  const { data: events } = await query;
  if (!events || events.length === 0) return [];

  // Look up user names
  const userIds = [...new Set(events.map((e) => e.created_by))];
  const { data: profiles } = await supabase
    .from('user_profiles')
    .select('user_id, full_name')
    .in('user_id', userIds);

  const nameMap = new Map(
    profiles?.map((p) => [p.user_id, p.full_name || 'Unknown']) || []
  );

  return events.map((event) => {
    const meta = (event.metadata || {}) as Record<string, unknown>;
    // Include entity_id in metadata so describeAuditEvent can build links
    const enrichedMeta = { ...meta, entity_id: event.entity_id };
    const { description, link } = describeAuditEvent(
      event.entity_type,
      event.action,
      enrichedMeta
    );

    return {
      id: event.id,
      action: event.action,
      entityType: event.entity_type,
      entityId: event.entity_id,
      description,
      createdAt: event.created_at,
      createdByName: nameMap.get(event.created_by) || 'Unknown',
      link,
    };
  });
}

export async function getCddExpiryWarnings(
  firmId: string
): Promise<CddExpiryWarning[]> {
  const supabase = await createClient();
  const stalenessConfig = getCddStalenessConfig();
  const longstopMonths = stalenessConfig.universalLongstopMonths ?? 24;

  // Get all clients (including those with null CDD) that have open matters
  const { data: allClients } = await supabase
    .from('clients')
    .select('id, name, last_cdd_verified_at');

  if (!allClients || allClients.length === 0) return [];

  const clientIds = allClients.map((c) => c.id);
  const { data: openMatters } = await supabase
    .from('matters')
    .select('client_id')
    .in('client_id', clientIds)
    .eq('status', 'open');

  const clientsWithOpenMatters = new Set(openMatters?.map((m) => m.client_id) || []);
  const eligibleClients = allClients.filter((c) => clientsWithOpenMatters.has(c.id));

  if (eligibleClients.length === 0) return [];

  // For each eligible client, find their most recent finalised assessment's risk level
  const eligibleIds = eligibleClients.map((c) => c.id);
  const { data: matters } = await supabase
    .from('matters')
    .select('id, client_id')
    .in('client_id', eligibleIds);

  if (!matters || matters.length === 0) return [];

  const matterIds = matters.map((m) => m.id);
  const { data: assessments } = await supabase
    .from('assessments')
    .select('id, matter_id, risk_level, finalised_at')
    .in('matter_id', matterIds)
    .not('finalised_at', 'is', null)
    .order('finalised_at', { ascending: false });

  const matterToClient = new Map(matters.map((m) => [m.id, m.client_id]));
  const clientRiskMap = new Map<string, string>();
  if (assessments) {
    for (const a of assessments) {
      const clientId = matterToClient.get(a.matter_id);
      if (clientId && !clientRiskMap.has(clientId)) {
        clientRiskMap.set(clientId, a.risk_level);
      }
    }
  }

  const now = new Date();
  const warnings: CddExpiryWarning[] = [];

  for (const client of eligibleClients) {
    const riskLevel = clientRiskMap.get(client.id) || 'HIGH';

    // Clients with no CDD verification recorded
    if (!client.last_cdd_verified_at) {
      warnings.push({
        clientId: client.id,
        clientName: client.name,
        lastVerifiedAt: null,
        riskLevel,
        thresholdMonths: 0,
        expiresAt: null,
        daysRemaining: -999,
        status: 'expired',
        longstopBreached: true,
      });
      continue;
    }

    const threshold = stalenessConfig.thresholds[riskLevel];
    if (!threshold) continue;

    const verifiedAt = new Date(client.last_cdd_verified_at);

    // Risk-based expiry
    const expiresAt = new Date(verifiedAt);
    expiresAt.setMonth(expiresAt.getMonth() + threshold.months);
    const daysRemaining = Math.ceil(
      (expiresAt.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)
    );

    // Universal longstop check
    const longstopDate = new Date(verifiedAt);
    longstopDate.setMonth(longstopDate.getMonth() + longstopMonths);
    const longstopBreached = now >= longstopDate;

    // Show if within 60 days of expiry, already expired, or longstop breached
    if (daysRemaining <= 60 || longstopBreached) {
      warnings.push({
        clientId: client.id,
        clientName: client.name,
        lastVerifiedAt: client.last_cdd_verified_at,
        riskLevel,
        thresholdMonths: threshold.months,
        expiresAt: expiresAt.toISOString(),
        daysRemaining,
        status: daysRemaining <= 0 ? 'expired' : 'expiring_soon',
        longstopBreached,
      });
    }
  }

  // Sort: longstop breached first, then expired, then by days remaining
  warnings.sort((a, b) => {
    if (a.longstopBreached && !b.longstopBreached) return -1;
    if (!a.longstopBreached && b.longstopBreached) return 1;
    if (a.status === 'expired' && b.status !== 'expired') return -1;
    if (a.status !== 'expired' && b.status === 'expired') return 1;
    return a.daysRemaining - b.daysRemaining;
  });

  return warnings;
}

export async function getAssessmentStaleWarnings(
  firmId: string,
  userId?: string
): Promise<AssessmentStaleWarning[]> {
  const supabase = await createClient();
  const stalenessConfig = getAssessmentStalenessConfig();

  // Get clients with open matters
  const { data: openMatters } = await supabase
    .from('matters')
    .select('id, client_id, reference')
    .eq('status', 'open');

  if (!openMatters || openMatters.length === 0) return [];

  const clientIds = [...new Set(openMatters.map((m) => m.client_id))];

  // Get client names
  const { data: clients } = await supabase
    .from('clients')
    .select('id, name')
    .in('id', clientIds);

  if (!clients || clients.length === 0) return [];

  const clientNameMap = new Map(clients.map((c) => [c.id, c.name]));

  // Get all matters for these clients to find assessments
  const { data: allMatters } = await supabase
    .from('matters')
    .select('id, client_id, reference')
    .in('client_id', clientIds);

  if (!allMatters || allMatters.length === 0) return [];

  const allMatterIds = allMatters.map((m) => m.id);
  const matterToClient = new Map(allMatters.map((m) => [m.id, m.client_id]));

  // Get finalised assessments, optionally scoped to user
  let assessmentQuery = supabase
    .from('assessments')
    .select('id, matter_id, risk_level, finalised_at, created_by')
    .in('matter_id', allMatterIds)
    .not('finalised_at', 'is', null)
    .order('finalised_at', { ascending: false });

  if (userId) {
    assessmentQuery = assessmentQuery.eq('created_by', userId);
  }

  const { data: assessments } = await assessmentQuery;

  // Build client → latest finalised assessment map
  const clientLatestAssessment = new Map<string, {
    assessmentId: string;
    finalisedAt: string;
    riskLevel: string;
    matterId: string;
  }>();

  if (assessments) {
    for (const a of assessments) {
      const clientId = matterToClient.get(a.matter_id);
      if (clientId && !clientLatestAssessment.has(clientId)) {
        clientLatestAssessment.set(clientId, {
          assessmentId: a.id,
          finalisedAt: a.finalised_at!,
          riskLevel: a.risk_level,
          matterId: a.matter_id,
        });
      }
    }
  }

  const now = new Date();
  const warnings: AssessmentStaleWarning[] = [];

  // Build open matter lookup: for each client, pick one open matter for the link
  const clientOpenMatter = new Map<string, { matterId: string; reference: string }>();
  for (const m of openMatters) {
    if (!clientOpenMatter.has(m.client_id)) {
      clientOpenMatter.set(m.client_id, { matterId: m.id, reference: m.reference });
    }
  }

  for (const clientId of clientIds) {
    const latest = clientLatestAssessment.get(clientId);
    if (!latest) continue; // No finalised assessment — nothing to go stale

    const threshold = stalenessConfig.thresholds[latest.riskLevel];
    if (!threshold) continue;

    const finalisedAt = new Date(latest.finalisedAt);
    const monthsElapsed = (now.getFullYear() - finalisedAt.getFullYear()) * 12 +
      (now.getMonth() - finalisedAt.getMonth());

    const staleAt = new Date(finalisedAt);
    staleAt.setMonth(staleAt.getMonth() + threshold.months);
    const daysUntilStale = Math.ceil(
      (staleAt.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)
    );

    const isStale = daysUntilStale <= 0;
    const isApproaching = !isStale && daysUntilStale <= 60;

    if (isStale || isApproaching) {
      const openMatter = clientOpenMatter.get(clientId);
      warnings.push({
        clientId,
        clientName: clientNameMap.get(clientId) || 'Unknown',
        latestAssessmentId: latest.assessmentId,
        latestAssessmentDate: latest.finalisedAt,
        riskLevel: latest.riskLevel,
        thresholdMonths: threshold.months,
        monthsElapsed,
        status: isStale ? 'stale' : 'approaching',
        matterId: openMatter?.matterId || latest.matterId,
        matterReference: openMatter?.reference || '',
      });
    }
  }

  // Sort: stale first, then by months elapsed descending
  warnings.sort((a, b) => {
    if (a.status === 'stale' && b.status !== 'stale') return -1;
    if (a.status !== 'stale' && b.status === 'stale') return 1;
    return b.monthsElapsed - a.monthsElapsed;
  });

  return warnings;
}

/**
 * Per-open-matter action-required snapshot for the dashboard.
 *
 * Each open matter is classified into EXACTLY ONE of four categories:
 *   1. no_assessment    — no finalised assessment yet
 *   2. no_cdd           — assessment finalised, but client has no last_cdd_verified_at
 *   3. cdd_expiring     — assessment + CDD done; CDD within EXPIRY_WINDOW_DAYS of risk-based expiry
 *   4. cdd_expired      — assessment + CDD done; CDD past expiry (risk-based OR universal longstop)
 *
 * Matters with finalised assessment + current CDD that isn't expiring don't appear at all.
 *
 * Closed matters are ignored. Each matter contributes one row to one category
 * (the same client can appear multiple times if they have multiple open matters
 * at different stages).
 */
const CDD_EXPIRING_WINDOW_DAYS = 60;

export async function getMatterActionItems(
  firmId: string
): Promise<MatterActionItemsResult> {
  const supabase = await createClient();
  const stalenessConfig = getCddStalenessConfig();
  const longstopMonths = stalenessConfig.universalLongstopMonths ?? 24;

  // All open matters in the firm with their client
  const { data: matters } = await supabase
    .from('matters')
    .select(
      'id, reference, description, client_id, created_at, clients!matters_client_id_fkey(id, name, last_cdd_verified_at)'
    )
    .eq('firm_id', firmId)
    .eq('status', 'open');

  type MatterRow = {
    id: string;
    reference: string;
    description: string | null;
    client_id: string;
    created_at: string;
    clients:
      | { id: string; name: string; last_cdd_verified_at: string | null }
      | { id: string; name: string; last_cdd_verified_at: string | null }[]
      | null;
  };
  const matterRows = (matters || []) as MatterRow[];
  if (matterRows.length === 0) {
    return { noAssessment: [], noCdd: [], cddExpiring: [], cddExpired: [] };
  }

  // Latest finalised assessment per matter
  const matterIds = matterRows.map((m) => m.id);
  const { data: assessments } = await supabase
    .from('assessments')
    .select('id, matter_id, risk_level, finalised_at')
    .in('matter_id', matterIds)
    .not('finalised_at', 'is', null)
    .order('finalised_at', { ascending: false });

  type AssessmentRow = {
    id: string;
    matter_id: string;
    risk_level: 'LOW' | 'MEDIUM' | 'HIGH';
    finalised_at: string | null;
  };
  const latestAssessmentByMatter = new Map<
    string,
    { riskLevel: 'LOW' | 'MEDIUM' | 'HIGH'; finalisedAt: string }
  >();
  for (const a of (assessments || []) as AssessmentRow[]) {
    if (!latestAssessmentByMatter.has(a.matter_id) && a.finalised_at) {
      latestAssessmentByMatter.set(a.matter_id, {
        riskLevel: a.risk_level,
        finalisedAt: a.finalised_at,
      });
    }
  }

  const now = new Date();
  const result: MatterActionItemsResult = {
    noAssessment: [],
    noCdd: [],
    cddExpiring: [],
    cddExpired: [],
  };

  for (const m of matterRows) {
    const client = Array.isArray(m.clients) ? m.clients[0] : m.clients;
    if (!client) continue;

    const base = {
      matterId: m.id,
      matterReference: m.reference,
      matterDescription: m.description,
      matterCreatedAt: m.created_at,
      clientId: client.id,
      clientName: client.name,
      lastCddVerifiedAt: client.last_cdd_verified_at,
      cddExpiresAt: null as string | null,
      daysUntilExpiry: null as number | null,
      daysSinceExpiry: null as number | null,
    };

    const assessment = latestAssessmentByMatter.get(m.id);

    // 1. No finalised assessment yet
    if (!assessment) {
      result.noAssessment.push({
        ...base,
        riskLevel: null,
        category: 'no_assessment',
      });
      continue;
    }

    // 2. Has assessment but client has no CDD verification yet
    if (!client.last_cdd_verified_at) {
      result.noCdd.push({
        ...base,
        riskLevel: assessment.riskLevel,
        category: 'no_cdd',
      });
      continue;
    }

    // 3/4. Compute expiry from risk-based threshold + universal longstop
    const threshold = stalenessConfig.thresholds[assessment.riskLevel];
    if (!threshold) continue; // misconfig — skip
    const verifiedAt = new Date(client.last_cdd_verified_at);
    const riskExpiresAt = new Date(verifiedAt);
    riskExpiresAt.setMonth(riskExpiresAt.getMonth() + threshold.months);
    const longstopExpiresAt = new Date(verifiedAt);
    longstopExpiresAt.setMonth(longstopExpiresAt.getMonth() + longstopMonths);
    const effectiveExpiresAt =
      riskExpiresAt < longstopExpiresAt ? riskExpiresAt : longstopExpiresAt;
    const msPerDay = 1000 * 60 * 60 * 24;
    const daysFromNow = Math.ceil(
      (effectiveExpiresAt.getTime() - now.getTime()) / msPerDay
    );

    if (daysFromNow <= 0) {
      result.cddExpired.push({
        ...base,
        riskLevel: assessment.riskLevel,
        category: 'cdd_expired',
        cddExpiresAt: effectiveExpiresAt.toISOString(),
        daysSinceExpiry: Math.abs(daysFromNow),
      });
    } else if (daysFromNow <= CDD_EXPIRING_WINDOW_DAYS) {
      result.cddExpiring.push({
        ...base,
        riskLevel: assessment.riskLevel,
        category: 'cdd_expiring',
        cddExpiresAt: effectiveExpiresAt.toISOString(),
        daysUntilExpiry: daysFromNow,
      });
    }
    // else: CDD current, not expiring — no entry
  }

  // Stable sort per category for UI determinism
  result.noAssessment.sort(
    (a, b) => new Date(a.matterCreatedAt).getTime() - new Date(b.matterCreatedAt).getTime()
  );
  result.noCdd.sort(
    (a, b) => new Date(a.matterCreatedAt).getTime() - new Date(b.matterCreatedAt).getTime()
  );
  // Expiring: soonest expiry first
  result.cddExpiring.sort((a, b) => (a.daysUntilExpiry ?? 0) - (b.daysUntilExpiry ?? 0));
  // Expired: most overdue first
  result.cddExpired.sort((a, b) => (b.daysSinceExpiry ?? 0) - (a.daysSinceExpiry ?? 0));

  return result;
}
