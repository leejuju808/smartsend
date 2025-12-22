import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

export async function POST(req: NextRequest) {
  try {
    const { campaign_id, lead_ids } = await req.json();
    const { data, error } = await supabase.rpc('retry_failed_batch', { p_campaign: campaign_id, p_lead_ids: lead_ids });
    if (error) throw error;
    return NextResponse.json({ ok: true, data });
  } catch (e:any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

export async function POST(req: NextRequest) {
  try {
    const { campaign_id, lead_ids } = await req.json();
    const { data, error } = await supabase.rpc('retry_failed_batch', { p_campaign: campaign_id, p_lead_ids: lead_ids });
    if (error) throw error;
    return NextResponse.json({ ok: true, data });
  } catch (e:any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}


