// Block 50000 — SmartSend Roofing QC Inspection System v1
// API Route: QC Dashboard Stats
// GET /api/qc/dashboard?workspace_id=xxx

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

// GET: Get QC dashboard statistics
export async function GET(req: NextRequest) {
  try {
    const supabase = await createClient();
    
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

    const { searchParams } = new URL(req.url);
    const workspace_id = searchParams.get("workspace_id");

    if (!workspace_id) {
      return NextResponse.json(
        { error: "workspace_id is required" },
        { status: 400 }
      );
    }

    // Get all inspections for workspace
    const { data: allInspections, error: inspectionsError } = await supabase
      .from("qc_inspections")
      .select("id, status, score, created_at")
      .eq("workspace_id", workspace_id);

    if (inspectionsError) {
      console.error("Error fetching inspections:", inspectionsError);
      return NextResponse.json(
        { error: "Failed to fetch inspections" },
        { status: 500 }
      );
    }

    // Calculate stats
    const stats = {
      pending: allInspections?.filter((i) => i.status === "pending").length || 0,
      in_review: allInspections?.filter((i) => i.status === "in_review").length || 0,
      completed: allInspections?.filter((i) => i.status === "completed").length || 0,
      failed: allInspections?.filter((i) => i.status === "failed").length || 0,
      re_inspection: allInspections?.filter((i) => i.status === "re_inspection").length || 0,
      average_score:
        allInspections && allInspections.length > 0
          ? allInspections.reduce((sum, i) => sum + (i.score || 0), 0) / allInspections.length
          : 0,
      total_inspections: allInspections?.length || 0,
    };

    // Get recent inspections needing attention
    const { data: pendingJobs, error: pendingError } = await supabase
      .from("qc_inspections")
      .select(`
        id,
        job_id,
        score,
        status,
        created_at,
        job:roofing_jobs(id, title, status)
      `)
      .eq("workspace_id", workspace_id)
      .in("status", ["pending", "in_review", "failed"])
      .order("created_at", { ascending: false })
      .limit(10);

    if (pendingError) {
      console.error("Error fetching pending jobs:", pendingError);
    }

    return NextResponse.json({
      success: true,
      stats,
      recent_pending: pendingJobs || [],
    });
  } catch (error: any) {
    console.error("Error in QC dashboard API:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}
































