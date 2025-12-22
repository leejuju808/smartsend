// Block 40210 — Storm Dashboard Data API
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET(req: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }

    const url = new URL(req.url);
    const workspace_id = url.searchParams.get("workspace_id");

    if (!workspace_id) {
      return NextResponse.json({ error: "workspace_id is required" }, { status: 400 });
    }

    // Get storm leads by urgency
    const { data: emergencyLeads, error: emergencyError } = await supabase.rpc(
      "get_storm_leads_by_urgency",
      {
        p_workspace_id: workspace_id,
        p_urgency: "emergency",
      }
    );

    const { data: urgentLeads, error: urgentError } = await supabase.rpc(
      "get_storm_leads_by_urgency",
      {
        p_workspace_id: workspace_id,
        p_urgency: "urgent",
      }
    );

    const { data: routineLeads, error: routineError } = await supabase.rpc(
      "get_storm_leads_by_urgency",
      {
        p_workspace_id: workspace_id,
        p_urgency: "routine",
      }
    );

    // Get active storm events
    const { data: activeStorms, error: stormsError } = await supabase.rpc(
      "get_active_storms_for_workspace",
      {
        p_workspace_id: workspace_id,
      }
    );

    // Get emergency repairs
    const { data: emergencyRepairs, error: repairsError } = await supabase
      .from("emergency_repairs")
      .select(`
        *,
        storm_leads!inner(*, leads(*)),
        crews(name, phone_number, email)
      `)
      .eq("workspace_id", workspace_id)
      .in("status", ["pending", "assigned", "en_route", "on_site"])
      .order("eta", { ascending: true });

    // Get crew statuses
    const { data: crewStatuses, error: crewError } = await supabase
      .from("crew_status")
      .select(`
        *,
        crews(name, phone_number, email, specialties)
      `)
      .eq("workspace_id", workspace_id)
      .order("last_updated", { ascending: false });

    // Get storm flag
    const { data: stormFlag } = await supabase
      .from("storm_flags")
      .select("*")
      .eq("workspace_id", workspace_id)
      .single();

    // Get stats
    const { count: totalLeads } = await supabase
      .from("storm_leads")
      .select("*", { count: "exact", head: true })
      .eq("workspace_id", workspace_id)
      .in("status", ["new", "triaged", "scheduled"]);

    const { count: completedRepairs } = await supabase
      .from("emergency_repairs")
      .select("*", { count: "exact", head: true })
      .eq("workspace_id", workspace_id)
      .eq("status", "completed");

    return NextResponse.json({
      ok: true,
      data: {
        queues: {
          emergency: emergencyLeads || [],
          urgent: urgentLeads || [],
          routine: routineLeads || [],
        },
        active_storms: activeStorms || [],
        emergency_repairs: emergencyRepairs || [],
        crew_statuses: crewStatuses || [],
        storm_flag: stormFlag || { active: false },
        stats: {
          total_leads: totalLeads || 0,
          completed_repairs: completedRepairs || 0,
          emergency_count: emergencyLeads?.length || 0,
          urgent_count: urgentLeads?.length || 0,
          routine_count: routineLeads?.length || 0,
        },
      },
    });
  } catch (error: any) {
    console.error("Error in GET /api/storm/dashboard:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}
































