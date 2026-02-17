'use server';

/**
 * Server Actions for Assistant Sources
 *
 * Manages curated AML source excerpts for the assistant.
 * No access to client data or assessments.
 */

import { createClient, getUser, getUserProfile } from '@/lib/supabase/server';
import type { AssistantSource, SourceType } from '@/lib/supabase/types';

/** Input for creating an assistant source */
export interface CreateAssistantSourceInput {
  source_type: SourceType;
  source_name: string;
  section_ref: string;
  topics: string[];
  content: string;
  effective_date?: string | null;
}

/** Result of creating an assistant source */
export type CreateAssistantSourceResult =
  | {
      success: true;
      source: AssistantSource;
    }
  | {
      success: false;
      error: string;
    };

/** Result of bulk creating assistant sources */
export type BulkCreateAssistantSourcesResult =
  | {
      success: true;
      sources: AssistantSource[];
      count: number;
    }
  | {
      success: false;
      error: string;
    };

/**
 * Create a single assistant source
 *
 * @param input - The source data
 * @returns The created source or error
 */
export async function createAssistantSource(
  input: CreateAssistantSourceInput
): Promise<CreateAssistantSourceResult> {
  try {
    const user = await getUser();
    if (!user) {
      return { success: false, error: 'Not authenticated' };
    }

    const profile = await getUserProfile();
    if (!profile) {
      return { success: false, error: 'User profile not found' };
    }

    const { source_type, source_name, section_ref, topics, content, effective_date } = input;

    if (!source_type || !source_name || !section_ref || !topics || !content) {
      return {
        success: false,
        error: 'Missing required fields: source_type, source_name, section_ref, topics, content',
      };
    }

    if (source_type !== 'external' && source_type !== 'internal') {
      return {
        success: false,
        error: 'source_type must be "external" or "internal"',
      };
    }

    const supabase = await createClient();

    const { data, error } = await supabase
      .from('assistant_sources')
      .insert({
        firm_id: profile.firm_id,
        source_type,
        source_name,
        section_ref,
        topics,
        content,
        effective_date: effective_date ?? null,
      })
      .select()
      .single();

    if (error || !data) {
      console.error('Failed to create assistant source:', error);
      return { success: false, error: 'Failed to create assistant source' };
    }

    return { success: true, source: data as AssistantSource };
  } catch (error) {
    console.error('Error in createAssistantSource:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error occurred',
    };
  }
}

/**
 * Bulk create assistant sources
 *
 * @param inputs - Array of source data
 * @returns The created sources or error
 */
export async function bulkCreateAssistantSources(
  inputs: CreateAssistantSourceInput[]
): Promise<BulkCreateAssistantSourcesResult> {
  try {
    const user = await getUser();
    if (!user) {
      return { success: false, error: 'Not authenticated' };
    }

    const profile = await getUserProfile();
    if (!profile) {
      return { success: false, error: 'User profile not found' };
    }

    if (!inputs || inputs.length === 0) {
      return { success: false, error: 'No sources provided' };
    }

    const supabase = await createClient();

    const records = inputs.map((input) => ({
      firm_id: profile.firm_id,
      source_type: input.source_type,
      source_name: input.source_name,
      section_ref: input.section_ref,
      topics: input.topics,
      content: input.content,
      effective_date: input.effective_date ?? null,
    }));

    const { data, error } = await supabase
      .from('assistant_sources')
      .insert(records)
      .select();

    if (error || !data) {
      console.error('Failed to bulk create assistant sources:', error);
      return { success: false, error: 'Failed to create assistant sources' };
    }

    return {
      success: true,
      sources: data as AssistantSource[],
      count: data.length,
    };
  } catch (error) {
    console.error('Error in bulkCreateAssistantSources:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error occurred',
    };
  }
}

/**
 * Get all assistant sources for the current firm
 *
 * @param sourceType - Optional filter by source type
 * @param topics - Optional filter by topics (any match)
 * @returns Array of assistant sources
 */
export async function getAssistantSources(
  sourceType?: SourceType,
  topics?: string[]
): Promise<AssistantSource[]> {
  try {
    const supabase = await createClient();

    let query = supabase
      .from('assistant_sources')
      .select('*')
      .order('source_name')
      .order('section_ref');

    if (sourceType) {
      query = query.eq('source_type', sourceType);
    }

    if (topics && topics.length > 0) {
      query = query.overlaps('topics', topics);
    }

    const { data, error } = await query;

    if (error || !data) {
      return [];
    }

    return data as AssistantSource[];
  } catch (error) {
    console.error('Error in getAssistantSources:', error);
    return [];
  }
}

/**
 * Get assistant source by ID
 *
 * @param sourceId - The source ID
 * @returns The source or null
 */
export async function getAssistantSource(
  sourceId: string
): Promise<AssistantSource | null> {
  try {
    const supabase = await createClient();

    const { data, error } = await supabase
      .from('assistant_sources')
      .select('*')
      .eq('id', sourceId)
      .single();

    if (error || !data) {
      return null;
    }

    return data as AssistantSource;
  } catch (error) {
    console.error('Error in getAssistantSource:', error);
    return null;
  }
}

/**
 * Search assistant sources by content or topics
 *
 * @param searchQuery - Text to search for
 * @returns Matching sources
 */
export async function searchAssistantSources(
  searchQuery: string
): Promise<AssistantSource[]> {
  try {
    if (!searchQuery || searchQuery.trim().length === 0) {
      return [];
    }

    const supabase = await createClient();

    // Search in content using ilike for simple text matching
    const { data, error } = await supabase
      .from('assistant_sources')
      .select('*')
      .or(`content.ilike.%${searchQuery}%,source_name.ilike.%${searchQuery}%,section_ref.ilike.%${searchQuery}%`)
      .order('source_name')
      .order('section_ref');

    if (error || !data) {
      return [];
    }

    return data as AssistantSource[];
  } catch (error) {
    console.error('Error in searchAssistantSources:', error);
    return [];
  }
}

/**
 * Delete all assistant sources for the current firm
 * Used for re-ingestion
 *
 * @param sourceType - Optional: only delete sources of this type
 * @returns Success or error
 */
export async function deleteAssistantSources(
  sourceType?: SourceType
): Promise<{ success: boolean; error?: string }> {
  try {
    const user = await getUser();
    if (!user) {
      return { success: false, error: 'Not authenticated' };
    }

    const profile = await getUserProfile();
    if (!profile) {
      return { success: false, error: 'User profile not found' };
    }

    const supabase = await createClient();

    let query = supabase
      .from('assistant_sources')
      .delete()
      .eq('firm_id', profile.firm_id);

    if (sourceType) {
      query = query.eq('source_type', sourceType);
    }

    const { error } = await query;

    if (error) {
      console.error('Failed to delete assistant sources:', error);
      return { success: false, error: 'Failed to delete assistant sources' };
    }

    return { success: true };
  } catch (error) {
    console.error('Error in deleteAssistantSources:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error occurred',
    };
  }
}
