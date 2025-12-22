// app/api/dashboard/campaign-performance/route.ts
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET() {
  const supabase = createClient();

  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    return NextResponse.json(
      { error: "Unauthorized" },
      { status: 401 }
    );
  }

  // Get user's workspace_id
  const { data: workspaceMember } = await supabase
    .from("workspace_members")
    .select("workspace_id")
    .eq("user_id", user.id)
    .limit(1)
    .maybeSingle();

  if (!workspaceMember?.workspace_id) {
    return NextResponse.json(
      { error: "Workspace not found" },
      { status: 404 }
    );
  }

  const workspaceId = workspaceMember.workspace_id;
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();

  // Get campaigns for this workspace first
  const { data: campaigns } = await supabase
    .from("campaigns")
    .select("id, name")
    .eq("workspace_id", workspaceId);

  const campaignIds = campaigns?.map((c) => c.id) || [];
  const campaignMap = new Map(campaigns?.map((c) => [c.id, c.name || "Unnamed Campaign"]) || []);

  if (campaignIds.length === 0) {
    return NextResponse.json([]);
  }

  // Get email messages for campaigns in this workspace (last 30 days)
  const { data: messages, error } = await supabase
    .from("email_messages")
    .select("campaign_id, direction, bounce, human_reply, created_at")
    .in("campaign_id", campaignIds)
    .gte("created_at", thirtyDaysAgo);

  if (error) {
    console.error("[CampaignPerformance] error", error);
    return NextResponse.json(
      { error: error.message },
      { status: 400 }
    );
  }

  // Compute stats per campaign
  const stats: Record<
    string,
    {
      campaign_id: string;
      campaign_name: string;
      emails_sent: number;
      replies: number;
      bounces: number;
    }
  > = {};

  for (const row of messages || []) {
    const cid = row.campaign_id || "uncategorized";
    if (!stats[cid]) {
      stats[cid] = {
        campaign_id: cid,
        campaign_name: campaignMap.get(cid) || "Uncategorized",
        emails_sent: 0,
        replies: 0,
        bounces: 0,
      };
    }

    if (row.direction === "outbound" && !row.bounce) {
      stats[cid].emails_sent += 1;
    }

    if (row.direction === "inbound" && row.human_reply) {
      stats[cid].replies += 1;
    }

    if (row.bounce) {
      stats[cid].bounces += 1;
    }
  }

  return NextResponse.json(Object.values(stats));
}

