import { NextRequest, NextResponse } from "next/server";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";
import { cookies } from "next/headers";

export async function GET(
  req: NextRequest,
  { params }: { params: { campaignId: string } }
) {
  const supabase = createRouteHandlerClient({ cookies });

  // Get current user for account_id
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Get campaign to find account_id
  const { data: campaign } = await supabase
    .from("campaigns")
    .select("id, account_id, user_id, workspace_id")
    .eq("id", params.campaignId)
    .single();

  if (!campaign) {
    return NextResponse.json({ error: "Campaign not found" }, { status: 404 });
  }

  // Determine account_id
  const accountId = campaign.account_id || campaign.user_id || campaign.workspace_id || user.id;

  // Call the RPC function to get stats
  const { data, error } = await supabase.rpc("get_campaign_lead_stats", {
    p_campaign_id: params.campaignId,
    p_account_id: accountId,
  });

  if (error) {
    console.error("get_campaign_lead_stats error:", error);
    return NextResponse.json(
      { error: "Failed to fetch lead stats", details: error.message },
      { status: 500 }
    );
  }

  return NextResponse.json(data || {
    total: 0,
    by_status: {},
    by_stage: {},
  });
}
























































