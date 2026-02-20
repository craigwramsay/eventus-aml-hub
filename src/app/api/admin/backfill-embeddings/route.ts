import { NextResponse } from 'next/server';
import { backfillEmbeddings } from '@/app/actions/assistant-sources';

export async function POST() {
  const result = await backfillEmbeddings();
  return NextResponse.json(result);
}
