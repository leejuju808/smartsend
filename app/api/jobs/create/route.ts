import { NextRequest, NextResponse } from "next/server";
import { getServerSupabase } from "@/src/lib/supabase/server";
import { getCurrentTeamId } from "@/lib/team-helpers";

// POST /api/jobs/create - Create a new job from a lead
export async function POST(req: NextRequest) {
  try {
    const supabase = await getServerSupabase();
    const teamId = await getCurrentTeamId();

    if (!teamId) {
      return NextResponse.json(
        { error: "Team ID not found" },
        { status: 401 }
      );
    }

    const body = await req.json();
    const { lead_id, contract_value, insurance, notes, stage } = body;

    if (!lead_id) {
      return NextResponse.json(
        { error: "lead_id is required" },
        { status: 400 }
      );
    }

    // Verify lead exists and belongs to team
    const { data: lead, error: leadError } = await supabase
      .from("leads")
      .select("id, team_id")
      .eq("id", lead_id)
      .single();

    if (leadError || !lead) {
      return NextResponse.json(
        { error: "Lead not found" },
        { status: 404 }
      );
    }

    // Create job
    const { data: job, error: jobError } = await supabase
      .from("jobs")
      .insert({
        lead_id,
        team_id: teamId,
        stage: stage || "estimate",
        contract_value: contract_value || null,
        insurance: insurance || false,
        notes: notes || null,
      })
      .select()
      .single();

    if (jobError) {
      console.error("Error creating job:", jobError);
      return NextResponse.json(
        { error: "Failed to create job", details: jobError.message },
        { status: 500 }
      );
    }

    return NextResponse.json({ job }, { status: 201 });
  } catch (error) {
    console.error("Error in create job route:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

































