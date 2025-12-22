// Block 56000 — SmartSend Roofing "Customer Review + Reputation Automation System" v1
// API Route: Daily Metrics Scan
// POST /api/reviews/metrics-scan
// Aggregates daily reputation metrics for dashboard and trend analysis
// Can be called manually or via cron job

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function POST(req: NextRequest) {
  try {
    const supabase = createClient();
    const body = await req.json();
    const { workspace_id, date } = body;

    // Verify cron secret or user auth
    const authHeader = req.headers.get("authorization");
    const cronSecret = process.env.CRON_SECRET;

    if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
      // If not cron, require user auth
      const {
        data: { user },
        error: authError,
      } = await supabase.auth.getUser();

      if (authError || !user) {
        return NextResponse.json(
          { error: "Unauthorized" },
          { status: 401 }
        );
      }
    }

    // If workspace_id provided, scan that workspace
    // Otherwise, scan all workspaces
    let workspaces: { id: string }[] = [];

    if (workspace_id) {
      const { data: workspace, error: workspaceError } = await supabase
        .from("workspaces")
        .select("id")
        .eq("id", workspace_id)
        .single();

      if (workspaceError || !workspace) {
        return NextResponse.json(
          { error: "Workspace not found" },
          { status: 404 }
        );
      }

      workspaces = [workspace];
    } else {
      // Get all workspaces
      const { data: allWorkspaces, error: workspacesError } = await supabase
        .from("workspaces")
        .select("id");

      if (workspacesError) {
        return NextResponse.json(
          { error: "Failed to fetch workspaces" },
          { status: 500 }
        );
      }

      workspaces = allWorkspaces || [];
    }

    // Use provided date or default to today
    const scanDate = date || new Date().toISOString().split("T")[0];

    const results = [];

    // Aggregate metrics for each workspace
    for (const workspace of workspaces) {
      try {
        const { error: aggregateError } = await supabase.rpc(
          "aggregate_reputation_metrics",
          {
            p_workspace_id: workspace.id,
            p_date: scanDate,
          }
        );

        if (aggregateError) {
          console.error(
            `Error aggregating metrics for workspace ${workspace.id}:`,
            aggregateError
          );
          results.push({
            workspace_id: workspace.id,
            success: false,
            error: aggregateError.message,
          });
        } else {
          results.push({
            workspace_id: workspace.id,
            success: true,
            date: scanDate,
          });
        }
      } catch (error: any) {
        console.error(
          `Error processing workspace ${workspace.id}:`,
          error
        );
        results.push({
          workspace_id: workspace.id,
          success: false,
          error: error.message,
        });
      }
    }

    const successCount = results.filter((r) => r.success).length;
    const failureCount = results.filter((r) => !r.success).length;

    return NextResponse.json(
      {
        success: true,
        date: scanDate,
        processed: workspaces.length,
        successful: successCount,
        failed: failureCount,
        results,
      },
      { status: 200 }
    );
  } catch (error: any) {
    console.error("Error in metrics scan:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}

// GET endpoint for manual trigger
export async function GET(req: NextRequest) {
  try {
    const supabase = createClient();

    // Require user auth for GET
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json(
        { error: "Unauthorized" },
        { status: 401 }
      );
    }

    // Get workspace_id from query params
    const { searchParams } = new URL(req.url);
    const workspace_id = searchParams.get("workspace_id");
    const date = searchParams.get("date") || undefined;

    // Call POST handler logic
    const request = new NextRequest(req.url, {
      method: "POST",
      headers: req.headers,
      body: JSON.stringify({ workspace_id, date }),
    });

    return POST(request);
  } catch (error: any) {
    console.error("Error in metrics scan GET:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}
































