// API routes for campaign_step_variants CRUD
import { NextRequest, NextResponse } from 'next/server';
import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs';
import { cookies } from 'next/headers';

// POST: upsert variant
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { campaign_id, step_no, name, weight, subject_template, body_html_template, enabled } = body;

    if (!campaign_id || !step_no || !name) {
      return NextResponse.json({ error: "campaign_id, step_no, name required" }, { status: 400 });
    }

    const supabase = createRouteHandlerClient({ cookies });
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Verify campaign ownership
    const { data: campaign, error: campaignError } = await supabase
      .from('campaigns')
      .select('id, user_id')
      .eq('id', campaign_id)
      .eq('user_id', user.id)
      .single();

    if (campaignError || !campaign) {
      return NextResponse.json({ error: 'Campaign not found or access denied' }, { status: 404 });
    }

    const { data, error } = await supabase.rpc("upsert_step_variant", {
      p_campaign: campaign_id,
      p_step: step_no,
      p_name: name,
      p_weight: weight ?? 0.5,
      p_subject: subject_template ?? null,
      p_body: body_html_template ?? null,
      p_enabled: enabled ?? true
    });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    return NextResponse.json({ ok: true, id: data }, { headers: { "content-type": "application/json" } });
  } catch (error: any) {
    return NextResponse.json({ error: error.message || "Internal server error" }, { status: 500 });
  }
}

// GET: list variants by campaign and step
export async function GET(req: NextRequest) {
  try {
    const u = new URL(req.url);
    const campaign_id = u.searchParams.get("campaign_id");
    const step_no = Number(u.searchParams.get("step_no") || "0");
    
    if (!campaign_id || !step_no) {
      return NextResponse.json({ error: "campaign_id & step_no required" }, { status: 400 });
    }

    const supabase = createRouteHandlerClient({ cookies });
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Verify campaign ownership
    const { data: campaign, error: campaignError } = await supabase
      .from('campaigns')
      .select('id, user_id')
      .eq('id', campaign_id)
      .eq('user_id', user.id)
      .single();

    if (campaignError || !campaign) {
      return NextResponse.json({ error: 'Campaign not found or access denied' }, { status: 404 });
    }

    const { data, error } = await supabase
      .from("campaign_step_variants")
      .select("id,name,weight,enabled,subject_template,body_html_template,created_at")
      .eq("campaign_id", campaign_id)
      .eq("step_no", step_no)
      .order("created_at", { ascending: true });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    return NextResponse.json({ rows: data ?? [] }, { headers: { "content-type": "application/json" } });
  } catch (error: any) {
    return NextResponse.json({ error: error.message || "Internal server error" }, { status: 500 });
  }
}

