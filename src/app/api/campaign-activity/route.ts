import { createClient } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';

export async function GET(req: Request) {
  const url = new URL(req.url);
  const c = url.searchParams.get('c');
  
  if (!c) {
    return NextResponse.json({ error: 'campaign_id required' }, { status: 400 });
  }

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );
  
  const { data, error } = await supabase
    .from('v_campaign_activity')
    .select('*')
    .eq('campaign_id', c)
    .limit(100)
    .order('created_at', { ascending: false });
  
  if (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
  
  return NextResponse.json({ rows: data }, { headers: { 'content-type':'application/json' } });
}

