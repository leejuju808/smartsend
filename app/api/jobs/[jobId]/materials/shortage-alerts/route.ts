// Block 24300 — SmartSend Roofing Material Orders & Supplier Tracking v1
// API Route: Get material shortage alerts for a job

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ jobId: string }> }
) {
  try {
    const { jobId } = await params;
    const supabase = await createClient();

    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Get job to verify access
    const { data: job, error: jobError } = await supabase
      .from("roofing_jobs")
      .select("workspace_id")
      .eq("id", jobId)
      .single();

    if (jobError || !job) {
      return NextResponse.json({ error: "Job not found" }, { status: 404 });
    }

    // Verify workspace access
    const { data: membership } = await supabase
      .from("workspace_members")
      .select("workspace_id")
      .eq("workspace_id", job.workspace_id)
      .eq("user_id", user.id)
      .single();

    if (!membership) {
      return NextResponse.json({ error: "Access denied" }, { status: 403 });
    }

    // Get shortage alerts
    const { data: alerts, error: alertsError } = await supabase
      .from("material_shortage_alerts")
      .select("*")
      .eq("job_id", jobId)
      .order("created_at", { ascending: false });

    if (alertsError) {
      console.error("Error fetching alerts:", alertsError);
      return NextResponse.json(
        { error: alertsError.message || "Failed to fetch alerts" },
        { status: 500 }
      );
    }

    return NextResponse.json({ alerts: alerts || [] });
  } catch (error: any) {
    console.error("Error fetching shortage alerts:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}






































