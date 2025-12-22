// Block 24300 — SmartSend Roofing Material Orders & Supplier Tracking v1
// API Route: Detect material shortages from crew notes (AI-powered)

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ jobId: string }> }
) {
  try {
    const { jobId } = await params;
    const body = await req.json();
    const { text, source = "crew_note" } = body;

    if (!text) {
      return NextResponse.json(
        { error: "Missing text to analyze" },
        { status: 400 }
      );
    }

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

    // Use database function to detect shortage
    const { data: alertId, error: detectError } = await supabase.rpc(
      "detect_material_shortage",
      {
        p_job_id: jobId,
        p_text: text,
        p_source: source,
      }
    );

    if (detectError) {
      console.error("Error detecting shortage:", detectError);
      return NextResponse.json(
        { error: detectError.message || "Failed to detect shortage" },
        { status: 500 }
      );
    }

    if (!alertId) {
      return NextResponse.json({
        detected: false,
        message: "No material shortage detected in the text",
      });
    }

    // Get the alert details
    const { data: alert } = await supabase
      .from("material_shortage_alerts")
      .select("*")
      .eq("id", alertId)
      .single();

    return NextResponse.json({
      detected: true,
      alert_id: alertId,
      alert: alert,
      message: `Detected ${alert?.shortage_type || "material shortage"}: ${alert?.item_description || "Materials"}`,
    });
  } catch (error: any) {
    console.error("Error detecting shortage:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}






































