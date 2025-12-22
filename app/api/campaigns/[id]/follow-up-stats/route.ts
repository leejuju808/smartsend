import { NextRequest, NextResponse } from "next/server";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";
import { cookies } from "next/headers";

export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const supabase = createRouteHandlerClient({ cookies });
  const campaignId = params.id;

  try {
    // Get campaign to verify access
    const {
      data: campaign,
      error: campaignError,
    } = await supabase
      .from("campaigns")
      .select("id, company_id, workspace_id, org_id, user_id")
      .eq("id", campaignId)
      .single();

    if (campaignError || !campaign) {
      return NextResponse.json(
        { error: "Campaign not found" },
        { status: 404 }
      );
    }

    // Query the view for live stats
    const { data, error } = await supabase
      .from("campaign_follow_up_stats_view")
      .select(
        `
        initial_sent,
        follow_ups_sent,
        replies_total,
        replies_from_followups,
        hot_leads,
        warm_leads,
        not_interested_leads,
        reply_rate,
        hot_lead_rate
      `
      )
      .eq("campaign_id", campaignId)
      .maybeSingle();

    if (error) {
      console.error(error);
      return NextResponse.json(
        { error: "Failed to load follow-up stats" },
        { status: 500 }
      );
    }

    if (!data) {
      // Return zeros if no data yet
      return NextResponse.json(
        {
          data: {
            initial_sent: 0,
            follow_ups_sent: 0,
            replies_total: 0,
            replies_from_followups: 0,
            hot_leads: 0,
            warm_leads: 0,
            not_interested_leads: 0,
            reply_rate: 0,
            hot_lead_rate: 0,
          },
        },
        { status: 200 }
      );
    }

    return NextResponse.json({ data }, { status: 200 });
  } catch (err: any) {
    console.error(err);
    return NextResponse.json(
      { error: "Unexpected error" },
      { status: 500 }
    );
  }
}











































