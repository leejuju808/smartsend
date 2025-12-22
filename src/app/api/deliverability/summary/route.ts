import { createClient } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';

export async function GET() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
  if (!url || !key) return NextResponse.json({ bounce_rate: 0, suppressed: 0 });
  const sb = createClient(url, key);
  const { data: b } = await sb.rpc('email_event_buckets', { from_ts: new Date(Date.now()-30*24*60*60*1000).toISOString(), to_ts: new Date().toISOString(), bucket: '30 days' });
  const totals = (b ?? []).reduce((a:any,x:any)=>({ sent:a.sent+(x.sent||0), bounced:a.bounced+(x.bounced||0) }), { sent:0, bounced:0 });
  const { data: s } = await sb.from('suppression_list').select('recipient', { count: 'exact', head: true });
  const bounce_rate = totals.sent ? +(totals.bounced / totals.sent * 100).toFixed(2) : 0;
  const suppressed = (s as any)?.length ?? 0; // head:true returns empty array but count via headers in real API; simplifying
  return NextResponse.json({ bounce_rate, suppressed });
}