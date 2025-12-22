// app/api/import/rejects/route.ts (placeholder)
import { NextRequest } from 'next/server';

export const runtime = 'nodejs';

export async function GET(req: NextRequest) {
  const sp = new URL(req.url).searchParams;
  const importId = sp.get('import_id');
  if (!importId) return new Response('Missing import_id', { status: 400 });
  return new Response('email,reason\n', { 
    headers: { 'Content-Type': 'text/csv; charset=utf-8' } 
  });
} 