// Block 37444 — SmartSend Roofing Job Costing + Profit Calculator Engine v1
// API Route: Acknowledge profit warning
// PATCH /api/jobs/[jobId]/warnings/[warningId] - Acknowledge warning

import { NextRequest, NextResponse } from "next/server";
import { getServerSupabase } from "@/src/lib/supabase/server";
import { getCurrentTeamId } from "@/lib/team-helpers";

// PATCH acknowledge warning
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ jobId: string; warningId: string }> }
) {
  try {
    const { jobId, warningId } = await params;
    const supabase = await getServerSupabase();
    const teamId = await getCurrentTeamId();

    if (!teamId) {
      return NextResponse.json(
        { error: "Team ID not found" },
        { status: 401 }
      );
    }

    const body = await req.json();
    const { acknowledged, resolved } = body;

    // Verify warning exists and belongs to job/team
    const { data: existingWarning, error: checkError } = await supabase
      .from("profit_warnings")
      .select("id, job_id, team_id")
      .eq("id", warningId)
      .eq("job_id", jobId)
      .eq("team_id", teamId)
      .single();

    if (checkError || !existingWarning) {
      return NextResponse.json(
        { error: "Warning not found" },
        { status: 404 }
      );
    }

    // Get current user
    const {
      data: { user },
    } = await supabase.auth.getUser();

    // Update warning
    const updateData: any = {};
    if (acknowledged !== undefined) {
      updateData.acknowledged = acknowledged;
      if (acknowledged) {
        updateData.acknowledged_at = new Date().toISOString();
        updateData.acknowledged_by = user?.id || null;
      }
    }
    if (resolved !== undefined && resolved) {
      updateData.resolved_at = new Date().toISOString();
    }

    const { data: updatedWarning, error: updateError } = await supabase
      .from("profit_warnings")
      .update(updateData)
      .eq("id", warningId)
      .select()
      .single();

    if (updateError) {
      console.error("Error updating warning:", updateError);
      return NextResponse.json(
        { error: "Failed to update warning", details: updateError.message },
        { status: 500 }
      );
    }

    return NextResponse.json({ warning: updatedWarning });
  } catch (error: any) {
    console.error("Error in patch warning route:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}
































