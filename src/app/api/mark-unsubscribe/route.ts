import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { getServerSupabase } from '@/lib/supabase/server';

export async function POST(req:Request){
  try {
    const supabase = getServerSupabase();
    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { thread_id } = await req.json();
    const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_ANON_KEY!);
    const { data: t } = await sb.from("inbox_threads").select("id,campaign_id,lead_id").eq("id", thread_id).maybeSingle();
    if (!t) return NextResponse.json("not found", { status:404 });
    await sb.rpc("suppress_lead", { p_campaign: t.campaign_id, p_lead: t.lead_id, p_reason:'manual', p_scope:'global', p_source:'ui' });
    await sb.from("inbox_threads").update({ stopped_by_reply:true, updated_at:new Date().toISOString() }).eq("id", t.id);
    await sb.rpc("cancel_future_queue_for_thread", { p_thread: t.id });
    return NextResponse.json({ ok:true }, { headers:{ "content-type":"application/json" } });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

