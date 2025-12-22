import { NextRequest, NextResponse } from 'next/server';
import { supabaseService, addSuppression } from '@/lib/suppressions';

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const q = searchParams.get('q');
  const sb = supabaseService();
  let query = sb.from('suppression_list').select('recipient, reason, source, domain, created_at').order('created_at', { ascending: false }).limit(500);
  if (q) {
    if (q.includes('@')) query = query.ilike('recipient', `%${q}%`);
    else query = query.ilike('domain', `%${q}%`);
  }
  const { data } = await query;
  return NextResponse.json({ items: data ?? [] });
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(()=>({}));
  const { recipient, reason = 'manual', source = 'ui' } = body || {};
  if (!recipient) return NextResponse.json({ ok:false, error:'RECIPIENT_REQUIRED' }, { status: 400 });
  await addSuppression(recipient, reason, source);
  return NextResponse.json({ ok:true });
}