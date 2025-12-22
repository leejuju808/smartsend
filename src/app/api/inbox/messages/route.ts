import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const campaignId = url.searchParams.get('campaignId');
  const leadId = url.searchParams.get('leadId');

  if (!campaignId || !leadId) return NextResponse.json({ error: 'campaignId and leadId required' }, { status: 400 });

  const { data, error } = await supabase
    .from('email_messages')
    .select('id, direction, subject, body, sent_at, from_email, to_email')
    .eq('campaign_id', campaignId)
    .eq('lead_id', leadId)
    .order('sent_at', { ascending: true });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ items: data || [] });
}


