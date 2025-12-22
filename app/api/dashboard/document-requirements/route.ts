// Block 25540 — SmartSend Roofing Warranty & Document Vault v1
// API Route: Owner Document Dashboard
// GET /api/dashboard/document-requirements

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET(req: NextRequest) {
  try {
    const supabase = createClient();
    const { searchParams } = new URL(req.url);
    const workspaceId = searchParams.get("workspace_id");

    if (!workspaceId) {
      return NextResponse.json(
        { error: "workspace_id is required" },
        { status: 400 }
      );
    }

    // Ensure user is authenticated
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Verify user has access to this workspace
    const { data: membership } = await supabase
      .from("workspace_members")
      .select("workspace_id")
      .eq("workspace_id", workspaceId)
      .eq("user_id", user.id)
      .single();

    if (!membership) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
    }

    // Get document requirements dashboard data
    const { data: dashboardData, error: dashboardError } = await supabase
      .from("owner_document_dashboard")
      .select("*")
      .eq("workspace_id", workspaceId)
      .order("missing_requirement_count", { ascending: false });

    if (dashboardError) {
      console.error("Error fetching dashboard:", dashboardError);
      return NextResponse.json(
        { error: dashboardError.message || "Failed to fetch dashboard" },
        { status: 500 }
      );
    }

    // Get summary statistics
    const totalJobsWithMissingDocs =
      dashboardData?.filter((job) => job.missing_requirement_count > 0)
        .length || 0;
    const totalMissingRequirements =
      dashboardData?.reduce(
        (sum, job) => sum + job.missing_requirement_count,
        0
      ) || 0;

    // Group by requirement type
    const requirementsByType: Record<string, number> = {};
    dashboardData?.forEach((job) => {
      job.missing_requirements?.forEach((req: string) => {
        requirementsByType[req] = (requirementsByType[req] || 0) + 1;
      });
    });

    return NextResponse.json({
      jobs: dashboardData || [],
      summary: {
        totalJobsWithMissingDocs,
        totalMissingRequirements,
        requirementsByType,
      },
    });
  } catch (error: any) {
    console.error("Error in GET document-requirements:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}




































