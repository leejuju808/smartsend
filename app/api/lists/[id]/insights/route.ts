// Block 15600 — SmartSend List Intelligence v1
// GET /api/lists/[id]/insights - Get list insights and intelligence analytics

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import {
  getListInsights,
  getListIntelligenceTimeline,
  getPriorityBadge,
  getListTypeDisplayName,
} from "@/lib/list-intelligence";

export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const supabase = createClient();

  try {
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Get user's workspace
    const { data: membership } = await supabase
      .from("workspace_members")
      .select("workspace_id")
      .eq("user_id", user.id)
      .limit(1)
      .maybeSingle();

    const workspaceId = membership?.workspace_id;

    if (!workspaceId) {
      return NextResponse.json(
        { error: "No workspace found" },
        { status: 400 }
      );
    }

    // Verify list exists and belongs to workspace
    const { data: list } = await supabase
      .from("contact_lists")
      .select("id, workspace_id")
      .eq("id", params.id)
      .eq("workspace_id", workspaceId)
      .single();

    if (!list) {
      return NextResponse.json({ error: "List not found" }, { status: 404 });
    }

    // Get intelligence insights
    const intelligence = await getListInsights(params.id);

    // Get timeline events
    const timeline = await getListIntelligenceTimeline(params.id);

    // Get contact count (if not already in intelligence)
    const { count: contactCount } = await supabase
      .from("contact_list_members")
      .select("*", { count: "exact", head: true })
      .eq("list_id", params.id);

    // Get campaigns that used this list
    const { data: campaigns } = await supabase
      .from("campaigns")
      .select("id, name, created_at")
      .eq("workspace_id", workspaceId)
      .contains("audience_list_ids", [params.id])
      .order("created_at", { ascending: false })
      .limit(10);

    // Build insights response
    const insights = {
      // Intelligence data
      list_type: intelligence?.list_type || null,
      list_type_display: getListTypeDisplayName(intelligence?.list_type || null),
      priority_score: intelligence?.priority_score || null,
      priority_badge: getPriorityBadge(intelligence?.priority_score || null),
      storm_count: intelligence?.storm_count || 0,
      insurance_count: intelligence?.insurance_count || 0,
      old_quote_count: intelligence?.old_quote_count || 0,
      estimated_revenue: intelligence?.estimated_revenue || null,
      low_quality_flag: intelligence?.low_quality_flag || false,
      commercial_flag: intelligence?.commercial_flag || false,
      recommended_campaign_type: intelligence?.recommended_campaign_type || null,
      intelligence_analyzed_at: intelligence?.intelligence_analyzed_at || null,
      intelligence_version: intelligence?.intelligence_version || null,

      // Contact metrics
      total_contacts: intelligence?.total_contacts || contactCount || 0,
      valid_emails: intelligence?.valid_emails || 0,
      invalid_emails: intelligence?.invalid_emails || 0,
      good_emails: intelligence?.valid_emails || 0,
      bad_emails: intelligence?.invalid_emails || 0,

      // Timeline
      timeline: timeline || [],
    };

    return NextResponse.json({
      insights,
      campaigns: campaigns || [],
    });
  } catch (err: any) {
    console.error("GET /api/lists/[id]/insights error:", err);
    return NextResponse.json(
      { error: "Internal server error", details: err?.message || String(err) },
      { status: 500 }
    );
  }
}

