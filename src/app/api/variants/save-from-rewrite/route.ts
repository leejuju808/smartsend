import { NextRequest, NextResponse } from "next/server";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";
import { cookies } from "next/headers";

export async function POST(req: NextRequest) {
  try {
    const { campaign_id, step_no, primary, ab } = await req.json();
    
    if (!campaign_id || step_no === undefined || !primary) {
      return NextResponse.json({ error: "campaign_id, step_no, primary required" }, { status: 400 });
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

    // Primary as Variant A
    const { data: aId, error: aErr } = await supabase.rpc("upsert_step_variant", {
      p_campaign: campaign_id,
      p_step: step_no,
      p_name: "A",
      p_weight: 0.5,
      p_subject: primary.subject ?? null,
      p_body: primary.html ?? null,
      p_enabled: true
    });

    if (aErr) {
      return NextResponse.json({ error: aErr.message }, { status: 400 });
    }

    // Optional B
    let bId = null;
    if (ab?.subject || ab?.html) {
      const { data: bRes, error: bErr } = await supabase.rpc("upsert_step_variant", {
        p_campaign: campaign_id,
        p_step: step_no,
        p_name: "B",
        p_weight: 0.5,
        p_subject: ab.subject ?? null,
        p_body: ab.html ?? null,
        p_enabled: true
      });

      if (bErr) {
        return NextResponse.json({ error: bErr.message }, { status: 400 });
      }
      bId = bRes;
    }

    return NextResponse.json({ ok: true, aId, bId }, { headers: { "content-type": "application/json" } });
  } catch (error: any) {
    console.error("Save from rewrite error:", error);
    return NextResponse.json({ error: error.message || "Internal server error" }, { status: 500 });
  }
}
