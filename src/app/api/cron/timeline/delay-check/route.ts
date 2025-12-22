// Block 64000 — Production Timeline Optimizer
// POST /api/cron/timeline/delay-check
// Cron job that runs every 15 minutes to check for production delays
// Should be called via: https://your-domain.com/api/cron/timeline/delay-check
// With header: Authorization: Bearer <cron-secret>

import { NextRequest, NextResponse } from "next/server";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";
import { cookies } from "next/headers";

const CRON_SECRET = process.env.CRON_SECRET || process.env.CRON_API_KEY;

export async function POST(req: NextRequest) {
  try {
    // Verify cron secret
    const authHeader = req.headers.get("authorization");
    const providedSecret = authHeader?.replace("Bearer ", "");
    
    if (CRON_SECRET && providedSecret !== CRON_SECRET) {
      return NextResponse.json(
        { error: "Unauthorized" },
        { status: 401 }
      );
    }

    const supabase = createRouteHandlerClient({ cookies });
    
    // Get all active workspaces
    const { data: workspaces, error: workspacesError } = await supabase
      .from("workspaces")
      .select("id")
      .eq("is_active", true);

    if (workspacesError) {
      console.error("Error fetching workspaces:", workspacesError);
      return NextResponse.json(
        { error: "Failed to fetch workspaces", details: workspacesError.message },
        { status: 500 }
      );
    }

    let totalAlertsCreated = 0;
    const results: any[] = [];

    // Run delay detection for each workspace
    for (const workspace of workspaces || []) {
      try {
        const { data: alertsCreated, error: detectError } = await supabase.rpc(
          "detect_production_delays",
          { p_workspace_id: workspace.id }
        );

        if (detectError) {
          console.error(`Error detecting delays for workspace ${workspace.id}:`, detectError);
          results.push({
            workspace_id: workspace.id,
            success: false,
            error: detectError.message
          });
          continue;
        }

        totalAlertsCreated += alertsCreated || 0;
        results.push({
          workspace_id: workspace.id,
          success: true,
          alerts_created: alertsCreated || 0
        });
      } catch (error: any) {
        console.error(`Error processing workspace ${workspace.id}:`, error);
        results.push({
          workspace_id: workspace.id,
          success: false,
          error: error.message
        });
      }
    }

    // Also check for weather impacts (if weather integration exists)
    // This would integrate with your weather service to adjust timelines

    return NextResponse.json({
      success: true,
      timestamp: new Date().toISOString(),
      total_alerts_created: totalAlertsCreated,
      workspaces_processed: results.length,
      results: results
    });
  } catch (error: any) {
    console.error("Error in cron delay-check:", error);
    return NextResponse.json(
      { error: error.message || "Unknown error" },
      { status: 500 }
    );
  }
}

// GET endpoint for health check
export async function GET(req: NextRequest) {
  return NextResponse.json({
    service: "timeline-delay-check-cron",
    status: "active",
    description: "Runs every 15 minutes to detect production delays"
  });
}




























