// Block 20120 — SLA / Heat Alerts API
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getActiveWorkspaceId } from "@/lib/workspace/context";
import { requireUserAndAccount } from "@/lib/supabase/server";

export async function GET(req: NextRequest) {
  try {
    const supabase = createClient();

    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }

    // Get workspace ID from active workspace
    const workspaceId = await getActiveWorkspaceId();

    if (!workspaceId) {
      return NextResponse.json(
        { error: "Workspace ID required" },
        { status: 400 }
      );
    }

    // Get account_id from workspace or user's account membership
    let accountId: string | null = null;
    
    // Try to get account_id from workspace
    const { data: workspace } = await supabase
      .from("workspaces")
      .select("account_id")
      .eq("id", workspaceId)
      .maybeSingle();
    
    accountId = workspace?.account_id || null;
    
    // Fallback: get account_id from user's account membership
    if (!accountId) {
      try {
        const { account } = await requireUserAndAccount(supabase);
        accountId = account.id;
      } catch (error) {
        // If we can't get account_id, continue with defaults
        console.warn("Could not resolve account_id, using defaults");
      }
    }

    // Get inbox settings for this account (with defaults)
    let hotSlaHours = 4;
    let warmSlaHours = 24;
    
    if (accountId) {
      const { data: settings } = await supabase
        .from("inbox_settings")
        .select("hot_sla_hours, warm_sla_hours")
        .eq("account_id", accountId)
        .maybeSingle();
      
      if (settings) {
        hotSlaHours = settings.hot_sla_hours || 4;
        warmSlaHours = settings.warm_sla_hours || 24;
      }
    }

    // Get campaign IDs for this workspace
    const { data: campaigns, error: campaignsError } = await supabase
      .from("campaigns")
      .select("id")
      .eq("workspace_id", workspaceId);

    if (campaignsError) {
      console.error("Error fetching campaigns:", campaignsError);
      return NextResponse.json(
        { error: "Failed to load campaigns" },
        { status: 500 }
      );
    }

    const campaignIds = campaigns?.map((c) => c.id) || [];

    if (campaignIds.length === 0) {
      return NextResponse.json(
        {
          unread_conversations: [],
          hot_waiting: [],
          warm_waiting: [],
        },
        { status: 200 }
      );
    }

    const now = new Date();
    const hotThresholdMs = hotSlaHours * 60 * 60 * 1000;
    const warmThresholdMs = warmSlaHours * 60 * 60 * 1000;
    const hotThresholdAgo = new Date(now.getTime() - hotThresholdMs);
    const warmThresholdAgo = new Date(now.getTime() - warmThresholdMs);

    // Base filter: only open/working leads (not won/lost)
    const baseFilter = supabase
      .from("inbox_threads")
      .select(
        `
        id,
        homeowner_name,
        homeowner_email,
        engagement_level,
        lead_stage,
        last_contact_at,
        unread_inbound_count,
        thread_estimated_value
      `
      )
      .in("campaign_id", campaignIds)
      .not("lead_stage", "in", '("won","lost")');

    // 1) Unread conversations
    const { data: unreadRows, error: unreadError } = await baseFilter
      .clone()
      .gt("unread_inbound_count", 0);

    if (unreadError) {
      console.error("Unread fetch error", unreadError);
    }

    // 2) Hot leads waiting >4 hours since last contact (or never contacted)
    const { data: hotRows, error: hotError } = await baseFilter
      .clone()
      .eq("engagement_level", "hot");

    if (hotError) {
      console.error("Hot leads error", hotError);
    }

    const hotWaiting =
      (hotRows || []).filter((c) => {
        if (!c.last_contact_at) return true; // never contacted yet
        const d = new Date(c.last_contact_at);
        return d < hotThresholdAgo;
      }) || [];

    // 3) Warm leads waiting >warm_sla_hours
    const { data: warmRows, error: warmError } = await baseFilter
      .clone()
      .eq("engagement_level", "warm");

    if (warmError) {
      console.error("Warm leads error", warmError);
    }

    const warmWaiting =
      (warmRows || []).filter((c) => {
        if (!c.last_contact_at) return true;
        const d = new Date(c.last_contact_at);
        return d < warmThresholdAgo;
      }) || [];

    return NextResponse.json(
      {
        unread_conversations: unreadRows || [],
        hot_waiting: hotWaiting,
        warm_waiting: warmWaiting,
      },
      { status: 200 }
    );
  } catch (error: any) {
    console.error("Error in SLA alerts API:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}

