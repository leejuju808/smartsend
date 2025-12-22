import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/utils/supabase/server";
import { getPlanConfig } from "@/lib/billing/plans";

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

  // Load campaign - check access via user_id or owner_id
  const { data: campaign, error: campErr } = await supabase
    .from("campaigns")
    .select("id, user_id, owner_id, status, daily_send_limit")
    .eq("id", campaignId)
    .maybeSingle();

  if (campErr || !campaign) {
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

  // Load subscription / plan
  const { data: sub } = await supabase
    .from("subscriptions")
    .select("plan")
    .eq("owner_id", userId)
    .maybeSingle();

  const planConfig = getPlanConfig(sub?.plan as any);

  // Enforce campaign count limit
  if (planConfig.maxCampaigns != null) {
    // Count active campaigns owned by user (check both user_id and owner_id)
    const { count: countByUserId } = await supabase
      .from("campaigns")
      .select("id", { count: "exact", head: true })
      .eq("user_id", userId)
      .in("status", ["active"]);

    const { count: countByOwnerId } = await supabase
      .from("campaigns")
      .select("id", { count: "exact", head: true })
      .eq("owner_id", userId)
      .in("status", ["active"]);

    // Get unique count (campaigns might have both user_id and owner_id set to same user)
    // For simplicity, use the maximum - in practice, campaigns should only have one or the other
    const activeCount = Math.max(countByUserId ?? 0, countByOwnerId ?? 0);

    if (activeCount >= planConfig.maxCampaigns && campaign.status !== "active") {
      return NextResponse.json(
        {
          error: `Your ${planConfig.name} plan allows ${planConfig.maxCampaigns} active campaign(s). Pause one or upgrade to start another.`,
        },
        { status: 403 }
      );
    }
  }

  // Default daily limit if not set
  let dailyLimit = campaign.daily_send_limit;
  if (!dailyLimit) {
    dailyLimit =
      planConfig.id === "starter"
        ? 50
        : planConfig.id === "growth"
        ? 150
        : 400;
  }

  const { error: updErr } = await supabase
    .from("campaigns")
    .update({
      status: "active",
      daily_send_limit: dailyLimit,
      last_queued_at: new Date().toISOString(),
    })
    .eq("id", campaignId);

  if (updErr) {
    console.error("Queue start error:", updErr);
    return NextResponse.json(
      { error: "Failed to start campaign" },
      { status: 500 }
    );
  }

  return NextResponse.json({ success: true, daily_send_limit: dailyLimit });
}

