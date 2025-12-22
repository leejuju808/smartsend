// Block 239000 — SmartSend Roofing Marketing Hub v1
// GET /api/marketing/list - List all marketing campaigns for a workspace

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET(req: NextRequest) {
  try {
    const supabase = createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Get query params
    const { searchParams } = new URL(req.url);
    const workspaceId = searchParams.get("workspace_id");
    const status = searchParams.get("status");
    const type = searchParams.get("type");
    const includeSteps = searchParams.get("include_steps") === "true";
    const includeLogs = searchParams.get("include_logs") === "true";

    if (!workspaceId) {
      return NextResponse.json(
        { error: "workspace_id required" },
        { status: 400 }
      );
    }

    // Verify workspace access
    const { data: workspaceMember } = await supabase
      .from("workspace_members")
      .select("workspace_id")
      .eq("workspace_id", workspaceId)
      .eq("user_id", user.id)
      .single();

    if (!workspaceMember) {
      return NextResponse.json({ error: "Workspace access denied" }, { status: 403 });
    }

    // Build query
    let query = supabase
      .from("marketing_campaigns")
      .select(includeSteps ? `
        *,
        marketing_steps (
          id,
          step_order,
          delay_hours,
          channel,
          subject,
          content,
          personalization_tokens,
          require_response,
          skip_if_condition
        )
      ` : "*")
      .eq("workspace_id", workspaceId)
      .order("created_at", { ascending: false });

    if (status) {
      query = query.eq("status", status);
    }

    if (type) {
      query = query.eq("type", type);
    }

    const { data: campaigns, error } = await query;

    if (error) {
      console.error("[Marketing Hub] Fetch campaigns error:", error);
      return NextResponse.json(
        { error: "Failed to fetch campaigns" },
        { status: 500 }
      );
    }

    // Optionally include recent logs for each campaign
    if (includeLogs && campaigns) {
      const campaignIds = campaigns.map((c: any) => c.id);
      
      const { data: logs } = await supabase
        .from("marketing_logs")
        .select("*")
        .in("campaign_id", campaignIds)
        .order("created_at", { ascending: false })
        .limit(100); // Limit to recent 100 logs

      // Group logs by campaign_id
      const logsByCampaign: Record<string, any[]> = {};
      if (logs) {
        logs.forEach((log: any) => {
          if (!logsByCampaign[log.campaign_id]) {
            logsByCampaign[log.campaign_id] = [];
          }
          logsByCampaign[log.campaign_id].push(log);
        });
      }

      // Attach logs to campaigns
      campaigns.forEach((campaign: any) => {
        campaign.logs = logsByCampaign[campaign.id] || [];
      });
    }

    // Get campaign statistics
    const stats = await Promise.all(
      (campaigns || []).map(async (campaign: any) => {
        const { data: instanceCount } = await supabase
          .from("marketing_campaign_instances")
          .select("id", { count: "exact", head: true })
          .eq("campaign_id", campaign.id);

        const { data: sentCount } = await supabase
          .from("marketing_logs")
          .select("id", { count: "exact", head: true })
          .eq("campaign_id", campaign.id)
          .eq("status", "sent");

        const { data: openedCount } = await supabase
          .from("marketing_logs")
          .select("id", { count: "exact", head: true })
          .eq("campaign_id", campaign.id)
          .not("opened_at", "is", null);

        const { data: clickedCount } = await supabase
          .from("marketing_logs")
          .select("id", { count: "exact", head: true })
          .eq("campaign_id", campaign.id)
          .not("clicked_at", "is", null);

        return {
          ...campaign,
          stats: {
            instances: instanceCount?.length || 0,
            sent: sentCount?.length || 0,
            opened: openedCount?.length || 0,
            clicked: clickedCount?.length || 0,
          },
        };
      })
    );

    return NextResponse.json({ campaigns: stats });
  } catch (error: any) {
    console.error("[Marketing Hub] Unexpected error:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}

























