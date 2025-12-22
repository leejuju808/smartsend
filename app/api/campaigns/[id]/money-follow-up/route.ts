// app/api/campaigns/[id]/money-follow-up/route.ts
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
    const { data, error } = await supabase
      .from("campaign_money_follow_up_view")
      .select(
        `
        campaign_id,
        campaign_name,
        leads_count,
        hot_leads,
        warm_leads,
        not_interested_leads,
        pipeline_value,
        booked_value,
        initial_sent,
        follow_ups_sent,
        replies_total,
        reply_rate_percent,
        hot_from_replies_percent
      `
      )
      .eq("campaign_id", campaignId)
      .maybeSingle();

    if (error) {
      console.error(error);
      return NextResponse.json(
        { error: "Failed to load campaign stats" },
        { status: 500 }
      );
    }

    return NextResponse.json({ data: data ?? null }, { status: 200 });
  } catch (err: any) {
    console.error(err);
    return NextResponse.json(
      { error: "Unexpected error" },
      { status: 500 }
    );
  }
}











































