// app/api/campaigns/[id]/followup-timeline/route.ts

import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServerClient, requireUserAndAccount } from "@/lib/supabase/server";

export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const supabase = getSupabaseServerClient();
    const { account } = await requireUserAndAccount(supabase);

    // 1) Load campaign
    const { data: campaign, error: cErr } = await supabase
      .from("campaigns")
      .select("*")
      .eq("id", params.id)
      .eq("account_id", account.id)
      .single();

    if (!campaign) {
      return NextResponse.json(
        { error: "campaign_not_found", details: cErr?.message },
        { status: 404 }
      );
    }

    if (!campaign.send_at) {
      return NextResponse.json(
        { error: "campaign_not_scheduled", details: "send_at is null" },
        { status: 400 }
      );
    }

    // 2) Load campaign steps (follow-up rules)
    // The system uses campaign_steps with step_no and offset_days
    const { data: steps, error: sErr } = await supabase
      .from("campaign_steps")
      .select("*")
      .eq("campaign_id", campaign.id)
      .eq("enabled", true)
      .order("step_no", { ascending: true });

    if (sErr) {
      return NextResponse.json(
        { error: "followup_rules_failed", details: sErr.message },
        { status: 500 }
      );
    }

    const results: Array<{ step: number; send_at: string }> = [];

    // Step 1 = campaign.send_at
    const base = new Date(campaign.send_at);
    results.push({
      step: 1,
      send_at: base.toISOString(),
    });

    // For step 2, 3, 4... (campaign_steps start from step_no >= 2)
    let current = new Date(base);

    for (const step of steps || []) {
      // Only process steps >= 2 (step 1 is the initial campaign send)
      if (step.step_no < 2) continue;
      
      const delayDays = step.offset_days || 0;
      if (delayDays <= 0) continue;

      current = new Date(current.getTime() + delayDays * 86400 * 1000);

      results.push({
        step: step.step_no,
        send_at: current.toISOString(),
      });
    }

    return NextResponse.json({
      campaignId: campaign.id,
      timeline: results,
    });
  } catch (err: any) {
    console.error("Follow-up timeline error:", err);
    return NextResponse.json(
      {
        error: "internal_error",
        details: err.message || "Unexpected error",
      },
      { status: 500 }
    );
  }
}












