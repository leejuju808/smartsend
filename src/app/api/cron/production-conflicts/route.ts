// Block 38390 — SmartSend Roofing Production Calendar Conflict Detection Cron
// GET /api/cron/production-conflicts
// Automatically detects and logs scheduling conflicts

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export async function GET(req: NextRequest) {
  try {
    // Verify cron secret
    const authHeader = req.headers.get("authorization");
    if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

    // Get all active workspaces
    const { data: workspaces, error: workspacesError } = await supabase
      .from("workspaces")
      .select("id")
      .eq("is_active", true);

    if (workspacesError || !workspaces) {
      return NextResponse.json(
        { error: "Failed to fetch workspaces" },
        { status: 500 }
      );
    }

    const results = [];

    // Run conflict detection for each workspace
    for (const workspace of workspaces) {
      try {
        const { data: conflicts, error } = await supabase.rpc("detect_schedule_conflicts", {
          p_workspace_id: workspace.id,
          p_date_from: new Date().toISOString().slice(0, 10),
          p_date_to: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10), // Next 30 days
        });

        if (error) {
          console.error(`Error detecting conflicts for workspace ${workspace.id}:`, error);
          results.push({
            workspace_id: workspace.id,
            success: false,
            error: error.message,
          });
        } else {
          results.push({
            workspace_id: workspace.id,
            success: true,
            conflicts_detected: conflicts?.length || 0,
          });
        }
      } catch (error: any) {
        console.error(`Error processing workspace ${workspace.id}:`, error);
        results.push({
          workspace_id: workspace.id,
          success: false,
          error: error.message,
        });
      }
    }

    return NextResponse.json({
      success: true,
      processed: workspaces.length,
      results,
    });
  } catch (error: any) {
    console.error("Production conflicts cron error:", error);
    return NextResponse.json(
      { error: "Internal server error", message: error.message },
      { status: 500 }
    );
  }
}
































