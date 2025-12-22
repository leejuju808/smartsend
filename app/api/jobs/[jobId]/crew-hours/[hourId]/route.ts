// Block 37444 — SmartSend Roofing Job Costing + Profit Calculator Engine v1
// API Route: Update/Delete crew hours entry
// PATCH /api/jobs/[jobId]/crew-hours/[hourId] - Update crew hours
// DELETE /api/jobs/[jobId]/crew-hours/[hourId] - Delete crew hours

import { NextRequest, NextResponse } from "next/server";
import { getServerSupabase } from "@/src/lib/supabase/server";
import { getCurrentTeamId } from "@/lib/team-helpers";

// PATCH update crew hours
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ jobId: string; hourId: string }> }
) {
  try {
    const { jobId, hourId } = await params;
    const supabase = await getServerSupabase();
    const teamId = await getCurrentTeamId();

    if (!teamId) {
      return NextResponse.json(
        { error: "Team ID not found" },
        { status: 401 }
      );
    }

    const body = await req.json();

    // Verify crew hours entry exists and belongs to job/team
    const { data: existingHour, error: checkError } = await supabase
      .from("crew_hours")
      .select("id, job_id, team_id")
      .eq("id", hourId)
      .eq("job_id", jobId)
      .eq("team_id", teamId)
      .single();

    if (checkError || !existingHour) {
      return NextResponse.json(
        { error: "Crew hours entry not found" },
        { status: 404 }
      );
    }

    // Update crew hours
    const updateData: any = {};
    if (body.crew_id !== undefined) updateData.crew_id = body.crew_id;
    if (body.crew_name !== undefined) updateData.crew_name = body.crew_name;
    if (body.start_time !== undefined) updateData.start_time = body.start_time;
    if (body.end_time !== undefined) updateData.end_time = body.end_time;
    if (body.hourly_rate !== undefined) updateData.hourly_rate = parseFloat(body.hourly_rate);
    if (body.crew_size !== undefined) updateData.crew_size = parseInt(body.crew_size);
    if (body.crew_members !== undefined) updateData.crew_members = body.crew_members;
    if (body.work_type !== undefined) updateData.work_type = body.work_type;
    if (body.issues !== undefined) updateData.issues = body.issues;

    const { data: updatedHour, error: updateError } = await supabase
      .from("crew_hours")
      .update(updateData)
      .eq("id", hourId)
      .select()
      .single();

    if (updateError) {
      console.error("Error updating crew hours:", updateError);
      return NextResponse.json(
        { error: "Failed to update crew hours", details: updateError.message },
        { status: 500 }
      );
    }

    // Recalculate profit
    await supabase.rpc("calculate_job_profit", { p_job_id: jobId });

    return NextResponse.json({ crewHour: updatedHour });
  } catch (error: any) {
    console.error("Error in patch crew hours route:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}

// DELETE crew hours entry
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ jobId: string; hourId: string }> }
) {
  try {
    const { jobId, hourId } = await params;
    const supabase = await getServerSupabase();
    const teamId = await getCurrentTeamId();

    if (!teamId) {
      return NextResponse.json(
        { error: "Team ID not found" },
        { status: 401 }
      );
    }

    // Verify crew hours entry exists and belongs to job/team
    const { data: existingHour, error: checkError } = await supabase
      .from("crew_hours")
      .select("id, job_id, team_id")
      .eq("id", hourId)
      .eq("job_id", jobId)
      .eq("team_id", teamId)
      .single();

    if (checkError || !existingHour) {
      return NextResponse.json(
        { error: "Crew hours entry not found" },
        { status: 404 }
      );
    }

    // Delete crew hours entry
    const { error: deleteError } = await supabase
      .from("crew_hours")
      .delete()
      .eq("id", hourId);

    if (deleteError) {
      console.error("Error deleting crew hours:", deleteError);
      return NextResponse.json(
        { error: "Failed to delete crew hours", details: deleteError.message },
        { status: 500 }
      );
    }

    // Recalculate profit
    await supabase.rpc("calculate_job_profit", { p_job_id: jobId });

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error("Error in delete crew hours route:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}
































