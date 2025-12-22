import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/utils/supabase/server";
import { getCurrentWorkspaceId } from "@/lib/workspace";

export async function GET(req: NextRequest) {
  try {
    const supabase = createClient();
    const workspaceId = await getCurrentWorkspaceId();

    if (!workspaceId) {
      return NextResponse.json({ error: "Workspace not found" }, { status: 404 });
    }

    // Get query parameters
    const searchParams = req.nextUrl.searchParams;
    const type = searchParams.get("type"); // Filter by type
    const search = searchParams.get("search"); // Full text search
    const userId = searchParams.get("user_id"); // Filter by user
    const limit = parseInt(searchParams.get("limit") || "500");
    const offset = parseInt(searchParams.get("offset") || "0");

    // Build query
    let query = supabase
      .from("team_activity")
      .select(`
        *,
        user:users(id, email, raw_user_meta_data),
        lead:leads(id, email, first_name, last_name),
        company:companies(id, name),
        campaign:campaigns(id, name),
        deal:deals(id, title, value, stage)
      `)
      .eq("workspace_id", workspaceId)
      .order("occurred_at", { ascending: false })
      .range(offset, offset + limit - 1);

    // Apply filters
    if (type) {
      // Handle filter groups
      if (type === "emails") {
        query = query.in("type", ["email_sent", "email_open", "email_click"]);
      } else if (type === "replies") {
        query = query.in("type", ["reply", "meeting_intent"]);
      } else if (type === "deals") {
        query = query.in("type", ["deal_created", "deal_stage_changed", "deal_won"]);
      } else if (type === "notes") {
        query = query.eq("type", "note_added");
      } else if (type === "tasks") {
        query = query.in("type", ["task_created", "task_completed"]);
      } else if (type === "system") {
        query = query.in("type", [
          "campaign_launched",
          "campaign_paused",
          "campaign_review_blocked",
          "ownership_changed",
        ]);
      } else if (type === "enrichment") {
        query = query.eq("type", "enrichment_run");
      } else {
        query = query.eq("type", type);
      }
    }

    if (userId) {
      query = query.eq("user_id", userId);
    }

    // Execute query
    const { data, error } = await query;

    if (error) {
      console.error("Error fetching team activity:", error);
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    // Apply search filter if provided (client-side filtering for now)
    let filteredData = data || [];
    if (search) {
      const searchLower = search.toLowerCase();
      filteredData = filteredData.filter(
        (activity) =>
          activity.title?.toLowerCase().includes(searchLower) ||
          activity.body?.toLowerCase().includes(searchLower)
      );
    }

    return NextResponse.json({ activities: filteredData });
  } catch (error: any) {
    console.error("Error in team activity API:", error);
    return NextResponse.json({ error: error.message || "Internal server error" }, { status: 500 });
  }
}








