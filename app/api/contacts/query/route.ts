// app/api/contacts/query/route.ts (placeholder)
import { NextRequest, NextResponse } from 'next/server';

export const runtime = 'nodejs';

export async function POST(_req: NextRequest) {
  return NextResponse.json({ ok: true, total: 0, returned: 0, items: [] });
} 