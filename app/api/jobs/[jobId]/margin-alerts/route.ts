// Block 25340 — SmartSend Roofing Job Costing & Profit Engine v1
// API Route: Get Margin Alerts for a Job

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ jobId: string }> }
) {
  try {
    const supabase = createClient();
    const { jobId } = await params;

    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Get margin alerts
    const { data: alerts, error } = await supabase
      .from("margin_alerts")
      .select("*")
      .eq("job_id", jobId)
      .eq("resolved", false)
      .order("created_at", { ascending: false });

    if (error) {
      console.error(error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ alerts: alerts || [] });
  } catch (error: any) {
    console.error("Get margin alerts error:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ jobId: string }> }
) {
  try {
    const supabase = createClient();
    const { jobId } = await params;

    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json();
    const { alert_id, action } = body; // action: 'acknowledge' or 'resolve'

    if (!alert_id || !action) {
      return NextResponse.json(
        { error: "Missing alert_id or action" },
        { status: 400 }
      );
    }

    const updateData: any = {};
    if (action === "acknowledge") {
      updateData.acknowledged = true;
      updateData.acknowledged_at = new Date().toISOString();
      updateData.acknowledged_by = user.id;
    } else if (action === "resolve") {
      updateData.resolved = true;
      updateData.resolved_at = new Date().toISOString();
      updateData.resolved_by = user.id;
    }

    const { error: updateError } = await supabase
      .from("margin_alerts")
      .update(updateData)
      .eq("id", alert_id)
      .eq("job_id", jobId);

    if (updateError) {
      console.error(updateError);
      return NextResponse.json({ error: updateError.message }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error("Update margin alert error:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}




































