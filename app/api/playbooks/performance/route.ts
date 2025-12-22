import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/utils/supabase/server";

export async function GET(req: NextRequest) {
  const supabase = createClient();
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Get workspace_id from workspace_members
  const { data: membership, error: membershipError } = await supabase
    .from("workspace_members")
    .select("workspace_id")
    .eq("user_id", user.id)
    .limit(1)
    .single();

  if (membershipError || !membership) {
    return NextResponse.json({ error: "No workspace found" }, { status: 400 });
  }

  const workspaceId = membership.workspace_id;

  // Get playbook performance (last 30 days)
  // This aggregates campaign stats grouped by playbook_id
  const { data: campaigns, error: campaignsError } = await supabase
    .from("campaigns")
    .select(
      `
      id,
      name,
      playbook_id,
      created_at,
      playbooks:playbook_id (
        id,
        name,
        slug
      )
    `
    )
    .eq("workspace_id", workspaceId)
    .not("playbook_id", "is", null)
    .gte("created_at", new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString());

  if (campaignsError) {
    console.error("Error fetching campaigns:", campaignsError);
    return NextResponse.json(
      { error: "Failed to fetch playbook performance" },
      { status: 500 }
    );
  }

  // Group campaigns by playbook_id and calculate metrics
  const playbookStats: Record<
    string,
    {
      playbook_id: string;
      playbook_name: string;
      campaigns_count: number;
      total_sent: number;
      total_replies: number;
      total_meetings: number;
      avg_reply_rate: number;
      avg_meeting_rate: number;
      total_pipeline: number;
    }
  > = {};

  for (const campaign of campaigns || []) {
    if (!campaign.playbook_id) continue;

    const playbook = campaign.playbooks as any;
    if (!playbookStats[campaign.playbook_id]) {
      playbookStats[campaign.playbook_id] = {
        playbook_id: campaign.playbook_id,
        playbook_name: playbook?.name || "Unknown",
        campaigns_count: 0,
        total_sent: 0,
        total_replies: 0,
        total_meetings: 0,
        avg_reply_rate: 0,
        avg_meeting_rate: 0,
        total_pipeline: 0,
      };
    }

    playbookStats[campaign.playbook_id].campaigns_count += 1;

    // Try to fetch campaign stats
    // Note: This depends on your actual stats structure
    // You may need to adjust based on your email_logs, campaign_logs, or other tables
    try {
      // Example: fetch from email_logs or campaign_logs
      // This is a simplified version - adjust based on your schema
      const { data: logs } = await supabase
        .from("email_logs")
        .select("id, event_type")
        .eq("campaign_id", campaign.id)
        .gte("created_at", new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString());

      if (logs) {
        const sent = logs.length;
        const replies = logs.filter((l: any) => l.event_type === "reply").length;
        const meetings = logs.filter((l: any) => l.event_type === "meeting_intent").length;

        playbookStats[campaign.playbook_id].total_sent += sent;
        playbookStats[campaign.playbook_id].total_replies += replies;
        playbookStats[campaign.playbook_id].total_meetings += meetings;
      }
    } catch (error) {
      // Stats table might not exist or have different structure
      console.warn("Could not fetch campaign stats:", error);
    }
  }

  // Calculate averages
  const performance = Object.values(playbookStats).map((stats) => {
    const avg_reply_rate =
      stats.total_sent > 0 ? (stats.total_replies / stats.total_sent) * 100 : 0;
    const avg_meeting_rate =
      stats.total_sent > 0 ? (stats.total_meetings / stats.total_sent) * 100 : 0;

    return {
      ...stats,
      avg_reply_rate: Math.round(avg_reply_rate * 100) / 100,
      avg_meeting_rate: Math.round(avg_meeting_rate * 100) / 100,
    };
  });

  return NextResponse.json({ performance });
}








