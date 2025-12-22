// Block 67000 — SmartSend Roofing "AI Crew Training Insights + Skill Gap Detection System" v1
// API Route: /api/crew/scorecards
// GET - Returns crew member scorecards with performance summary

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

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
    const workspaceId = searchParams.get("workspace_id");
    const crewMemberId = searchParams.get("crew_member_id");
    const crewId = searchParams.get("crew_id");

    if (!workspaceId) {
      return NextResponse.json(
        { error: "workspace_id is required" },
        { status: 400 }
      );
    }

    // Verify access
    const { data: member } = await supabase
      .from("workspace_members")
      .select("workspace_id")
      .eq("workspace_id", workspaceId)
      .eq("user_id", user.id)
      .single();

    if (!member) {
      return NextResponse.json(
        { error: "Access denied" },
        { status: 403 }
      );
    }

    // Get scorecards from view
    let query = supabase
      .from("v_crew_member_performance_summary")
      .select("*")
      .eq("workspace_id", workspaceId)
      .order("overall", { ascending: false, nullsLast: true });

    if (crewMemberId) {
      query = query.eq("crew_member_id", crewMemberId);
    } else if (crewId) {
      query = query.eq("crew_id", crewId);
    }

    const { data: scorecards, error: fetchError } = await query;

    if (fetchError) {
      console.error("Error fetching scorecards:", fetchError);
      return NextResponse.json(
        { error: "Failed to fetch scorecards", details: fetchError.message },
        { status: 500 }
      );
    }

    // Format response
    const formatted = scorecards?.map((item: any) => ({
      crew_member_id: item.crew_member_id,
      name: item.crew_member_name,
      crew_name: item.crew_name,
      skills: {
        tear_off: item.tear_off,
        shingle_installation: item.shingle_installation,
        flashing: item.flashing,
        ventilation: item.ventilation,
        ridge: item.ridge,
        cleanup: item.cleanup,
        safety: item.safety,
        time_management: item.time_management,
        overall: item.overall
      },
      jobs_assessed: item.jobs_assessed_count || 0,
      improvement_percentage: item.latest_improvement_percentage,
      pending_training: item.pending_training_count || 0,
      last_assessed_at: item.last_assessed_at
    })) || [];

    return NextResponse.json({
      success: true,
      scorecards: formatted,
      total: formatted.length
    });
  } catch (error: any) {
    console.error("Error in scorecards route:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}




























