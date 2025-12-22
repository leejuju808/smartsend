import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/utils/supabase/server";

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user)
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  const userId = user.id;
  const campaignId = params.id;

  // Check campaign access first
  const { data: campaign } = await supabase
    .from("campaigns")
    .select("id, user_id, owner_id")
    .eq("id", campaignId)
    .maybeSingle();

  if (!campaign) {
    return NextResponse.json({ error: "Campaign not found" }, { status: 404 });
  }

  // Check if user owns the campaign (via user_id or owner_id)
  const ownsCampaign = 
    (campaign.user_id === userId) || 
    ((campaign as any).owner_id === userId);

  if (!ownsCampaign) {
    // Check if user has editor/owner access via campaign shares
    const { data: share } = await supabase
      .from("smartsend_campaign_shares")
      .select("role")
      .eq("campaign_id", campaignId)
      .eq("user_id", userId)
      .maybeSingle();

    if (!share || share.role === "viewer") {
      return NextResponse.json({ error: "Campaign not found" }, { status: 404 });
    }
  }

  const { error } = await supabase
    .from("campaigns")
    .update({ status: "paused" })
    .eq("id", campaignId);

  if (error) {
    console.error("Pause error:", error);
    return NextResponse.json(
      { error: "Failed to pause campaign" },
      { status: 500 }
    );
  }

  return NextResponse.json({ success: true });
}

