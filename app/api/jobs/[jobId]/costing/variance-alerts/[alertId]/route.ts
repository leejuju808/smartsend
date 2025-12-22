// Block 255700 — SmartSend Job Costing & Profit Engine v1
// API Route: Acknowledge/resolve variance alert
// PATCH /api/jobs/[jobId]/costing/variance-alerts/[alertId] - Update alert

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function PATCH(
  req: NextRequest,
  {
    params,
  }: { params: Promise<{ jobId: string; alertId: string }> }
) {
  try {
    const { jobId, alertId } = await params;
    const supabase = await createClient();

    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json();
    const { acknowledged, resolved } = body;

    const updateData: any = {};

    if (acknowledged !== undefined) {
      updateData.acknowledged = acknowledged;
      if (acknowledged) {
        updateData.acknowledged_at = new Date().toISOString();
        updateData.acknowledged_by = user.id;
      }
    }

    if (resolved !== undefined && resolved) {
      updateData.resolved_at = new Date().toISOString();
    }

    const { data: alert, error } = await supabase
      .from("job_variance_alerts")
      .update(updateData)
      .eq("id", alertId)
      .eq("job_id", jobId)
      .select()
      .single();

    if (error) {
      console.error("Error updating alert:", error);
      return NextResponse.json(
        { error: "Failed to update alert" },
        { status: 500 }
      );
    }

    return NextResponse.json({ alert });
  } catch (error: any) {
    console.error("Error in update variance alert:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}





















