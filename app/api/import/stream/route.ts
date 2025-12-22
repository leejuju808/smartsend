// app/api/import/stream/route.ts (placeholder NDJSON)
import { NextRequest } from 'next/server';

export const runtime = 'nodejs';

export async function POST(_req: NextRequest) {
  const body = '{"type":"error","message":"stream placeholder – replace with real importer"}\n';
  return new Response(body, { 
    status: 501, 
    headers: { 'Content-Type': 'application/x-ndjson; charset=utf-8' } 
  });
} 