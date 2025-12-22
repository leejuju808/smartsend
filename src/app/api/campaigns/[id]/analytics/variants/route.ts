import { NextRequest, NextResponse } from "next/server";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";
import { cookies } from "next/headers";

export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const supabase = createRouteHandlerClient({ cookies });
    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const campaignId = params.id;

    // Verify campaign ownership
    const { data: campaign, error: campaignError } = await supabase
      .from("campaigns")
      .select("id, user_id")
      .eq("id", campaignId)
      .single();

    if (campaignError || !campaign) {
      return NextResponse.json({ error: "Campaign not found" }, { status: 404 });
    }

    // Get all steps for this campaign
    const { data: steps, error: stepsError } = await supabase
      .from("campaign_steps")
      .select("id, step_no")
      .eq("campaign_id", campaignId)
      .order("step_no", { ascending: true });

    if (stepsError) {
      return NextResponse.json({ error: stepsError.message }, { status: 500 });
    }

    // Get variant stats for each step
    const variantsByStep: any[] = [];
    for (const step of steps || []) {
      const { data: variantStats, error: variantError } = await supabase.rpc(
        "get_step_variant_stats",
        { p_step_id: step.id }
      );

      if (!variantError && variantStats) {
        variantsByStep.push({
          step_id: step.id,
          step_no: step.step_no,
          variants: variantStats.map((v: any) => ({
            variant_id: v.variant_id,
            variant_key: v.variant_key,
            sent: Number(v.sent) || 0,
            opened: Number(v.opened) || 0,
            clicked: Number(v.clicked) || 0,
            replied: Number(v.replied) || 0,
            open_rate: Number(v.open_rate) || 0,
            click_rate: Number(v.click_rate) || 0,
            reply_rate: Number(v.reply_rate) || 0,
          })),
        });
      }
    }

    return NextResponse.json({ variantsByStep });
  } catch (e: any) {
    return NextResponse.json(
      { error: e.message || "Failed to fetch variant analytics" },
      { status: 500 }
    );
  }
}



