/**
 * Storm Opportunities Queue
 * GET /api/storm/opportunities
 * Returns leads/threads affected by storms, sorted by value and severity
 */

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getActiveWorkspaceId } from "@/lib/workspaces/server";

/**
 * GET /api/storm/opportunities
 * Get storm-affected leads/threads for the inbox filter
 * Query params: campaign_id, severity, sort_by (value|severity|timeline|last_contact)
 */
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

    const workspaceId = await getActiveWorkspaceId();
    if (!workspaceId) {
      return NextResponse.json({ error: "Workspace not found" }, { status: 404 });
    }

    const { searchParams } = new URL(req.url);
    const campaignId = searchParams.get("campaign_id");
    const severity = searchParams.get("severity");
    const sortBy = searchParams.get("sort_by") || "value"; // value, severity, timeline, last_contact
    const limit = parseInt(searchParams.get("limit") || "50");

    // Build query using the storm_opportunities_queue view
    let query = supabase
      .from("storm_opportunities_queue")
      .select("*")
      .eq("workspace_id", workspaceId)
      .limit(limit);

    if (campaignId) {
      query = query.eq("campaign_id", campaignId);
    }

    if (severity) {
      query = query.eq("storm_severity", severity);
    }

    // Apply sorting
    switch (sortBy) {
      case "value":
        query = query.order("thread_estimated_value", { ascending: false, nullsLast: true });
        break;
      case "severity":
        query = query.order("storm_severity", { ascending: false });
        break;
      case "timeline":
        query = query.order("event_started_at", { ascending: false });
        break;
      case "last_contact":
        query = query.order("last_contacted_at", { ascending: true, nullsLast: true });
        break;
      default:
        query = query.order("thread_estimated_value", { ascending: false, nullsLast: true });
    }

    const { data: opportunities, error } = await query;

    if (error) {
      console.error("Error fetching storm opportunities:", error);
      return NextResponse.json(
        { error: "Failed to fetch storm opportunities" },
        { status: 500 }
      );
    }

    return NextResponse.json({ opportunities: opportunities || [] });
  } catch (error) {
    console.error("Error in /api/storm/opportunities:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

