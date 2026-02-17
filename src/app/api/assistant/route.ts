/**
 * AML Assistant API Endpoint
 *
 * POST /api/assistant
 *
 * Accepts:
 * {
 *   questionText: string,
 *   uiContext?: { questionId?: string, questionText?: string }
 * }
 *
 * Returns:
 * {
 *   answer: string,
 *   citations: Array<{ sourceName: string, sectionRef: string }>
 * }
 *
 * Safety:
 * - No access to clients, matters, assessments, or form answers
 * - Rejects requests containing client data
 * - Logs calls without storing content
 */

import { NextRequest, NextResponse } from 'next/server';
import { getUser, getUserProfile } from '@/lib/supabase/server';
import { createClient } from '@/lib/supabase/server';
import { processAssistantRequest } from '@/lib/assistant';
import type { AssistantRequest } from '@/lib/assistant';

/** Log an assistant call (without content) */
async function logAssistantCall(
  firmId: string,
  userId: string,
  success: boolean,
  questionLength: number
): Promise<void> {
  try {
    const supabase = await createClient();

    await supabase.from('audit_events').insert({
      firm_id: firmId,
      entity_type: 'assistant',
      entity_id: 'assistant_query',
      action: success ? 'assistant_query_success' : 'assistant_query_error',
      metadata: {
        question_length: questionLength,
        timestamp: new Date().toISOString(),
      },
      created_by: userId,
    });
  } catch (error) {
    // Don't fail the request if logging fails
    console.error('Failed to log assistant call:', error);
  }
}

export async function POST(request: NextRequest) {
  try {
    // Authenticate user
    const user = await getUser();
    if (!user) {
      return NextResponse.json(
        { error: 'Not authenticated' },
        { status: 401 }
      );
    }

    // Get user profile for firm context
    const profile = await getUserProfile();
    if (!profile) {
      return NextResponse.json(
        { error: 'User profile not found' },
        { status: 403 }
      );
    }

    // Get firm name
    const supabase = await createClient();
    const { data: firmData } = await supabase
      .from('firms')
      .select('name')
      .eq('id', profile.firm_id)
      .single();

    const firmName = firmData?.name || 'AML Hub';

    // Parse request body
    let body: AssistantRequest;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json(
        { error: 'Invalid JSON in request body' },
        { status: 400 }
      );
    }

    // Validate request structure
    if (!body || typeof body.questionText !== 'string') {
      return NextResponse.json(
        { error: 'Missing required field: questionText' },
        { status: 400 }
      );
    }

    // Process the request
    const result = await processAssistantRequest(body, {
      firmId: profile.firm_id,
      firmName,
    });

    // Log the call (without content)
    await logAssistantCall(
      profile.firm_id,
      user.id,
      result.success,
      body.questionText.length
    );

    if (!result.success) {
      return NextResponse.json(
        { error: result.error },
        { status: 400 }
      );
    }

    return NextResponse.json(result.response);
  } catch (error) {
    console.error('Assistant API error:', error);

    // Check for LLM configuration errors
    if (error instanceof Error && error.message.includes('environment variable')) {
      return NextResponse.json(
        { error: 'Assistant is not configured. Please contact your administrator.' },
        { status: 503 }
      );
    }

    return NextResponse.json(
      { error: 'An unexpected error occurred' },
      { status: 500 }
    );
  }
}

// Only allow POST
export async function GET() {
  return NextResponse.json(
    { error: 'Method not allowed' },
    { status: 405 }
  );
}
