import { NextRequest, NextResponse } from "next/server";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";
import { cookies } from "next/headers";

export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const supabase = createRouteHandlerClient({ cookies });
    
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const campaignId = params.id;

    // Verify user has access to this campaign
    const { data: campaign } = await supabase
      .from("campaigns")
      .select("id, workspace_id")
      .eq("id", campaignId)
      .single();

    if (!campaign) {
      return NextResponse.json({ error: "Campaign not found" }, { status: 404 });
    }

    // Check workspace membership
    const { data: workspaceMember } = await supabase
      .from("workspace_members")
      .select("workspace_id")
      .eq("workspace_id", campaign.workspace_id)
      .eq("user_id", user.id)
      .single();

    if (!workspaceMember) {
      return NextResponse.json({ error: "Access denied" }, { status: 403 });
    }

    // Get campaign analytics
    const { data, error } = await supabase
      .from("analytics_campaign")
      .select("*")
      .eq("campaign_id", campaignId)
      .single();

    if (error && error.code !== "PGRST116") {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    // Calculate rates
    const sent = data?.sent || 0;
    const delivered = data?.delivered || 0;
    const opens = data?.opens || 0;
    const unique_opens = data?.unique_opens || 0;
    const clicks = data?.clicks || 0;
    const replies = data?.replies || 0;
    const bounces = data?.bounces || 0;
    const spam = data?.spam || 0;

    const result = {
      campaign_id: campaignId,
      ...data,
      sent,
      delivered,
      opens,
      unique_opens,
      clicks,
      replies,
      bounces,
      spam,
      open_rate: sent > 0 ? (opens / sent) * 100 : 0,
      unique_open_rate: sent > 0 ? (unique_opens / sent) * 100 : 0,
      click_rate: sent > 0 ? (clicks / sent) * 100 : 0,
      reply_rate: sent > 0 ? (replies / sent) * 100 : 0,
      bounce_rate: sent > 0 ? (bounces / sent) * 100 : 0,
      spam_rate: sent > 0 ? (spam / sent) * 100 : 0,
      delivery_rate: sent > 0 ? (delivered / sent) * 100 : 0,
    };

    return NextResponse.json(result, {
      headers: {
        "Cache-Control": "public, max-age=300, s-maxage=300, stale-while-revalidate=600",
      },
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message || "Internal server error" }, { status: 500 });
  }
}



