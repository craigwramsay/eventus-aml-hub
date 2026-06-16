/**
 * Post-import enrichment for Clio-imported Hub clients.
 *
 * Clio's matter.create webhook only gives us the contact's name and type
 * ("Person" or "Company"). The Hub stores this via process_clio_webhook
 * RPC, which sets:
 *   - entity_type = 'individual' or 'corporate' (generic)
 *   - client_type = 'individual' or 'corporate'
 *
 * The assessment form expects `entity_type` to be a specific value
 * ("Private company limited by shares", "LLP", "Individual", etc.) and
 * needs registered_number / registered_address for corporates. None of
 * those come from Clio.
 *
 * This helper enriches a Hub client AFTER process_clio_webhook has run:
 *
 *   1. If entity_type is still the generic value ('individual' / 'corporate'),
 *      promote it to a sensible specific default:
 *        - 'individual' → 'Individual'
 *        - 'corporate'  → 'Private company limited by shares' (most common UK form)
 *
 *   2. If the client is corporate AND registered_number is null,
 *      search Companies House by name. If EXACTLY ONE active company
 *      matches, populate registered_number + registered_address. If zero
 *      or multiple matches, leave blank — user can fix via Edit Details.
 *
 * Conservative — only enriches missing fields. Never overwrites values the
 * user has explicitly set.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import {
  searchCompaniesByName,
  CompaniesHouseError,
  type CompanySearchHit,
} from '@/lib/companies-house/client';

export type EnrichmentOutcome =
  | { entityTypeUpdated: boolean; chOutcome: 'populated' | 'ambiguous' | 'not_found' | 'skipped' | 'error'; chError?: string; chMatchCount?: number; populatedNumber?: string; populatedAddress?: string };

export interface EnrichClientOptions {
  /** When true, only PREVIEW what would happen — don't persist. */
  dryRun?: boolean;
}

/**
 * Promote a generic Clio entity_type to a specific default for the form.
 * Returns null if the value is already specific (or unrecognised — leave alone).
 */
export function promoteGenericEntityType(current: string | null | undefined): string | null {
  const trimmed = (current ?? '').trim();
  if (!trimmed) return 'Individual';
  if (trimmed.toLowerCase() === 'individual') return 'Individual';
  if (trimmed.toLowerCase() === 'corporate') return 'Private company limited by shares';
  return null;
}

/**
 * Run enrichment on a single client. Loads the row, decides what to update,
 * applies updates (unless dryRun), returns a summary.
 */
export async function enrichClioImportedClient(
  supabase: SupabaseClient,
  firmId: string,
  clientId: string,
  options: EnrichClientOptions = {}
): Promise<EnrichmentOutcome> {
  const dryRun = options.dryRun ?? false;

  const { data: client, error: fetchErr } = await supabase
    .from('clients')
    .select('id, firm_id, name, entity_type, client_type, registered_number, registered_address')
    .eq('id', clientId)
    .single();

  if (fetchErr || !client) {
    return { entityTypeUpdated: false, chOutcome: 'error', chError: 'Client not found' };
  }
  if (client.firm_id !== firmId) {
    return { entityTypeUpdated: false, chOutcome: 'error', chError: 'Firm mismatch' };
  }

  const updates: Record<string, unknown> = {};
  let entityTypeUpdated = false;

  // 1. Promote entity_type
  const promotedEntityType = promoteGenericEntityType(client.entity_type);
  if (promotedEntityType && promotedEntityType !== client.entity_type) {
    updates.entity_type = promotedEntityType;
    entityTypeUpdated = true;
  }

  // 2. Companies House lookup — corporates only, only when registered_number is blank
  const isCorporate = (client.client_type as string)?.toLowerCase() !== 'individual';
  const needsChLookup = isCorporate && !client.registered_number;
  let chOutcome: EnrichmentOutcome['chOutcome'] = 'skipped';
  let chError: string | undefined;
  let chMatchCount: number | undefined;
  let populatedNumber: string | undefined;
  let populatedAddress: string | undefined;

  if (needsChLookup) {
    let hits: CompanySearchHit[] = [];
    try {
      hits = await searchCompaniesByName(client.name as string, {
        limit: 5,
        activeOnly: true,
      });
    } catch (err) {
      chOutcome = 'error';
      chError =
        err instanceof CompaniesHouseError
          ? err.message
          : err instanceof Error
            ? err.message
            : 'Unknown error';
    }
    if (chOutcome !== 'error') {
      chMatchCount = hits.length;
      if (hits.length === 0) {
        chOutcome = 'not_found';
      } else if (hits.length === 1) {
        chOutcome = 'populated';
        populatedNumber = hits[0].companyNumber;
        populatedAddress = hits[0].address;
        updates.registered_number = populatedNumber;
        updates.registered_address = populatedAddress;
      } else {
        chOutcome = 'ambiguous';
      }
    }
  }

  if (!dryRun && Object.keys(updates).length > 0) {
    updates.updated_at = new Date().toISOString();
    const { error: updateErr } = await supabase
      .from('clients')
      .update(updates)
      .eq('id', clientId);
    if (updateErr) {
      return {
        entityTypeUpdated: false,
        chOutcome: 'error',
        chError: `Update failed: ${updateErr.message}`,
      };
    }
  }

  return {
    entityTypeUpdated,
    chOutcome,
    chError,
    chMatchCount,
    populatedNumber,
    populatedAddress,
  };
}
