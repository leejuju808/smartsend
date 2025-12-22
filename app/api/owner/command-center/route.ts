// Block 27580 — API Route for Owner Command Center
// Fetches aggregated data from roofing_owner_command_center view

import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { getActiveWorkspaceId } from "@/lib/workspace/context";

export async function GET() {
  try {
    const workspaceId = await getActiveWorkspaceId();
    
    if (!workspaceId) {
      return NextResponse.json(
        { error: "No active workspace" },
        { status: 401 }
      );
    }

    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

    // Main summary card from command center view
    const { data: summary, error: summaryError } = await supabase
      .from("roofing_owner_command_center")
      .select("*")
      .eq("workspace_id", workspaceId)
      .single();

    if (summaryError) {
      console.error("Error fetching command center summary:", summaryError);
      return NextResponse.json(
        { error: "Failed to fetch command center data" },
        { status: 500 }
      );
    }

    // Collections list (top 5 by priority)
    // Note: roofing_collections_priority doesn't have workspace_id, so we join through jobs
    // Get all collections and filter by workspace through jobs
    const { data: allCollections } = await supabase
      .from("roofing_collections_priority")
      .select("*")
      .order("days_overdue", { ascending: false })
      .limit(20); // Get more than needed to filter
    
    // Get job IDs for this workspace
    const { data: workspaceJobs } = await supabase
      .from("roofing_jobs")
      .select("id")
      .eq("workspace_id", workspaceId);
    
    const jobIds = new Set(workspaceJobs?.map(j => j.id) || []);
    const collections = (allCollections || [])
      .filter((c: any) => jobIds.has(c.job_id))
      .slice(0, 5);

    // Top pipeline deals (top 5 by win probability)
    const { data: pipeline } = await supabase
      .from("roofing_deal_priority")
      .select("*")
      .eq("workspace_id", workspaceId)
      .order("win_probability", { ascending: false })
      .limit(5);

    // Next 4 weeks capacity & load
    const { data: capacity } = await supabase
      .from("roofing_install_load_vs_capacity")
      .select("*")
      .eq("workspace_id", workspaceId)
      .gte("week_start", new Date().toISOString().split('T')[0])
      .order("week_start", { ascending: true })
      .limit(4);

    return NextResponse.json({
      summary: summary || {},
      collections: collections || [],
      pipeline: pipeline || [],
      capacity: capacity || []
    });
  } catch (error) {
    console.error("Command center API error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Internal server error" },
      { status: 500 }
    );
  }
}

