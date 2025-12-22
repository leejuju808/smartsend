import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/utils/supabase/server";
import { getPlanConfig } from "@/lib/billing/plans";

export async function GET(
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
    // Check if user has access via campaign shares
    const { data: share } = await supabase
      .from("smartsend_campaign_shares")
      .select("role")
      .eq("campaign_id", campaignId)
      .eq("user_id", userId)
      .maybeSingle();

    if (!share) {
      return NextResponse.json({ error: "Campaign not found" }, { status: 404 });
    }
  }

  const now = new Date();
  const todayStart = new Date(
    now.getFullYear(),
    now.getMonth(),
    now.getDate()
  ).toISOString();
  const todayEnd = new Date(
    now.getFullYear(),
    now.getMonth(),
    now.getDate() + 1
  ).toISOString();

  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
  const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 1).toISOString();

  // Sent today for this campaign
  const { count: sentToday } = await supabase
    .from("outbound_emails")
    .select("id", { count: "exact", head: true })
    .eq("owner_id", userId)
    .eq("campaign_id", campaignId)
    .eq("status", "sent")
    .gte("sent_at", todayStart)
    .lt("sent_at", todayEnd);

  // Sent this month across all campaigns
  const { count: sentThisMonth } = await supabase
    .from("outbound_emails")
    .select("id", { count: "exact", head: true })
    .eq("owner_id", userId)
    .eq("status", "sent")
    .gte("sent_at", monthStart)
    .lt("sent_at", monthEnd);

  // Plan - check subscriptions table with owner_id
  const { data: sub } = await supabase
    .from("subscriptions")
    .select("plan")
    .eq("owner_id", userId)
    .maybeSingle();

  const planConfig = getPlanConfig(sub?.plan as any);

  return NextResponse.json(
    {
      status: campaign.status,
      daily_send_limit: campaign.daily_send_limit,
      sent_today: sentToday ?? 0,
      sent_this_month: sentThisMonth ?? 0,
      monthly_limit: planConfig.monthlyEmailLimit,
      plan_name: planConfig.name,
    },
    { status: 200 }
  );
}

