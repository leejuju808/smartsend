// Block 25180 — SmartSend Roofing Job Completion Engine v1
// API Route: Completion Dashboard
// GET /api/jobs/completion-dashboard

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET(req: NextRequest) {
  try {
    const supabase = createClient();

    // Ensure user is authenticated
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

    // Get workspace_id from query params or user's default workspace
    const { searchParams } = new URL(req.url);
    const workspaceId = searchParams.get("workspace_id");

    if (!workspaceId) {
      return NextResponse.json(
        { error: "workspace_id required" },
        { status: 400 }
      );
    }

    // Verify workspace access
    const { data: membership } = await supabase
      .from("workspace_members")
      .select("workspace_id")
      .eq("workspace_id", workspaceId)
      .eq("user_id", user.id)
      .single();

    if (!membership) {
      return NextResponse.json(
        { error: "Access denied" },
        { status: 403 }
      );
    }

    // Get completion dashboard data
    const { data: dashboardData, error: dashboardError } = await supabase.rpc(
      "get_completion_dashboard",
      { p_workspace_id: workspaceId }
    );

    if (dashboardError) {
      console.error("Error fetching completion dashboard:", dashboardError);
      return NextResponse.json(
        { error: dashboardError.message || "Failed to fetch dashboard" },
        { status: 500 }
      );
    }

    // Get additional stats
    const { data: pendingJobs } = await supabase
      .from("job_completion_tracking")
      .select(`
        job_id,
        completion_status,
        roofing_jobs!inner(
          id,
          title,
          job_value
        )
      `)
      .eq("workspace_id", workspaceId)
      .neq("completion_status", "fully_complete")
      .in("completion_status", [
        "install_complete",
        "cleanup_pending",
        "photos_pending",
        "invoice_pending",
        "invoice_sent",
        "payment_pending",
        "warranty_pending",
        "review_pending",
        "referral_pending"
      ]);

    // Count missing items
    const missingItems = {
      photos: 0,
      cleanup: 0,
      invoices: 0,
      warranties: 0,
    };

    if (pendingJobs) {
      pendingJobs.forEach((item: any) => {
        const status = item.completion_status;
        if (status === "photos_pending") missingItems.photos++;
        if (status === "cleanup_pending") missingItems.cleanup++;
        if (status === "invoice_pending" || status === "invoice_sent" || status === "payment_pending") {
          missingItems.invoices++;
        }
        if (status === "warranty_pending") missingItems.warranties++;
      });
    }

    return NextResponse.json(
      {
        ...dashboardData,
        stats: {
          pendingCompletions: pendingJobs?.length || 0,
          missingItems,
        },
      },
      { status: 200 }
    );
  } catch (error: any) {
    console.error("Error fetching completion dashboard:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}





































