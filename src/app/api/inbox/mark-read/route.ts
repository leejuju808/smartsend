import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

export async function POST(req: NextRequest) {
  const { campaignId, leadId } = await req.json();
  if (!campaignId || !leadId) return NextResponse.json({ error: 'campaignId and leadId required' }, { status: 400 });

  const { error } = await supabase.rpc('fn_mark_inbound_read', { _campaign: campaignId, _lead: leadId });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true });
}


