/**
 * Health Check Endpoint
 *
 * GET /api/health
 * Returns 200 with basic status. No sensitive data exposed.
 */

import { NextResponse } from 'next/server';

export async function GET() {
  return NextResponse.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
  });
}
